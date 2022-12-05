import { DefinitionParams, Location, Position, Range, ReferenceParams, TextDocuments } from 'vscode-languageserver'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { URI } from 'vscode-uri'
import * as fs from 'fs/promises'
import FileInfoIndex, { FunctionVisibility, MatlabClassMemberInfo, MatlabCodeData, MatlabFunctionInfo } from '../../indexing/FileInfoIndex'
import Indexer from '../../indexing/Indexer'
import { MatlabConnection } from '../../lifecycle/MatlabCommunicationManager'
import MatlabLifecycleManager from '../../lifecycle/MatlabLifecycleManager'
import { getTextOnLine } from '../../utils/TextDocumentUtils'
import PathResolver from './PathResolver'

class Expression {
    constructor (public components: string[], public selectedComponent: number) {}

    get fullExpression (): string {
        return this.components.join('.')
    }

    get targetExpression (): string {
        return this.components.slice(0, this.selectedComponent + 1).join('.')
    }

    get unqualifiedTarget (): string {
        return this.components[this.selectedComponent]
    }

    get first (): string {
        return this.components[0]
    }

    get last (): string {
        return this.components[this.components.length - 1]
    }
}

export enum RequestType {
    Definition,
    References
}

class NavigationSupportProvider {
    private readonly DOTTED_IDENTIFIER_REGEX = /[\w.]+/ // Does this need to be more specific? Like /[_a-zA-Z]\w*(?:\.[\w]+)*/

    async handleDefOrRefRequest (params: DefinitionParams | ReferenceParams, documentManager: TextDocuments<TextDocument>, requestType: RequestType): Promise<Location[]> {
        const matlabConnection = MatlabLifecycleManager.getMatlabConnection()
        if (matlabConnection == null) {
            return []
        }

        const uri = params.textDocument.uri
        const textDocument = documentManager.get(uri)

        if (textDocument == null) {
            return []
        }

        // Find ID for which to find the definition or references
        const expression = this.getTarget(textDocument, params.position)

        if (expression == null) {
            // No target found
            return []
        }

        if (requestType === RequestType.Definition) {
            return await this.findDefinition(uri, params.position, expression, matlabConnection)
        } else {
            return this.findReferences(uri, params.position, expression)
        }
    }

    private getTarget (textDocument: TextDocument, position: Position): Expression | null {
        const idAtPosition = this.getIdentifierAtPosition(textDocument, position)

        if (idAtPosition.identifier === '') {
            return null
        }

        const idComponents = idAtPosition.identifier.split('.')

        // Determine what component was targeted
        let length = 0
        let i = 0
        while (i < idComponents.length && length <= position.character - idAtPosition.start) {
            length += idComponents[i].length + 1 // +1 for '.'
            i++
        }

        return new Expression(idComponents, i - 1) // Compensate for extra increment in loop
    }

    private getIdentifierAtPosition (textDocument: TextDocument, position: Position): { identifier: string, start: number } {
        let lineText = getTextOnLine(textDocument, position.line)

        const result = {
            identifier: '',
            start: -1
        }

        let matchResults = lineText.match(this.DOTTED_IDENTIFIER_REGEX)
        let offset = 0

        while (matchResults != null) {
            if (matchResults.index == null || matchResults.index > position.character) {
                // Already passed the cursor - no match found
                break
            }

            const startChar = offset + matchResults.index
            if (startChar + matchResults[0].length >= position.character) {
                // Found overlapping identifier
                result.identifier = matchResults[0]
                result.start = startChar
                break
            }

            // Match found too early in line - check for following matches
            lineText = lineText.substring(matchResults.index + matchResults[0].length)
            offset = startChar + matchResults[0].length

            matchResults = lineText.match(this.DOTTED_IDENTIFIER_REGEX)
        }

        return result
    }

    private async findDefinition (uri: string, position: Position, expression: Expression, matlabConnection: MatlabConnection): Promise<Location[]> {
        // Get code data for current file
        const codeData = FileInfoIndex.codeDataCache.get(uri)

        if (codeData == null) {
            // File not indexed - unable to look for definition
            return []
        }

        const definitionInCodeData = this.findDefinitionInCodeData(uri, position, expression, codeData)

        if (definitionInCodeData != null) {
            return definitionInCodeData
        }

        // Check the MATLAB path
        const definitionOnPath = await this.findDefinitionOnPath(uri, position, expression, matlabConnection)

        if (definitionOnPath != null) {
            return definitionOnPath
        }

        // If not on path, may be in user's workspace
        return this.findDefinitionInWorkspace(uri, position, expression)
    }

    private findDefinitionInCodeData (uri: string, position: Position, expression: Expression, codeData: MatlabCodeData): Location[] | null {
        // If first part of expression targeted - look for a local variable
        if (expression.selectedComponent === 0) {
            const containingFunction = codeData.findContainingFunction(position)
            if (containingFunction != null) {
                const varDefs = this.getVariableDefsOrRefs(containingFunction, expression.unqualifiedTarget, uri, RequestType.Definition)
                if (varDefs != null) {
                    return varDefs
                }
            }
        }

        // Check for functions in file
        let functionDeclaration = this.getFunctionDeclaration(codeData, expression.fullExpression)
        if (functionDeclaration != null) {
            const functionRange = functionDeclaration.declaration ?? Range.create(0, 0, 0, 0)
            return [Location.create(functionDeclaration.uri, functionRange)]
        }

        // Check for definitions within classes
        if (codeData.isClassDef && codeData.classInfo != null) {
            // Look for methods/properties within class definitions (e.g. obj.foo)
            functionDeclaration = this.getFunctionDeclaration(codeData, expression.last)
            if (functionDeclaration != null) {
                const functionRange = functionDeclaration.declaration ?? Range.create(0, 0, 0, 0)
                return [Location.create(functionDeclaration.uri, functionRange)]
            }

            // Look for possible properties
            if (expression.selectedComponent === 1) {
                const propertyDeclaration = this.getPropertyDeclaration(codeData, expression.last)
                if (propertyDeclaration != null) {
                    const propertyRange = Range.create(propertyDeclaration.range.start, propertyDeclaration.range.end)
                    const uri = codeData.classInfo.uri
                    if (uri != null) {
                        return [Location.create(uri, propertyRange)]
                    }
                }
            }
        }

        return null
    }

    private findReferences (uri: string, position: Position, expression: Expression): Location[] {
        // Get code data for current file
        const codeData = FileInfoIndex.codeDataCache.get(uri)

        if (codeData == null) {
            // File not indexed - unable to look for references
            return []
        }

        const referencesInCodeData = this.findReferencesInCodeData(uri, position, expression, codeData)

        if (referencesInCodeData != null) {
            return referencesInCodeData
        }

        return []
    }

    private findReferencesInCodeData (uri: string, position: Position, expression: Expression, codeData: MatlabCodeData): Location[] | null {
        // If first part of expression is targeted - look for a local variable
        if (expression.selectedComponent === 0) {
            const containingFunction = codeData.findContainingFunction(position)
            if (containingFunction != null) {
                const varRefs = this.getVariableDefsOrRefs(containingFunction, expression.unqualifiedTarget, uri, RequestType.References)
                if (varRefs != null) {
                    return varRefs
                }
            }
        }

        // Check for functions in file
        const functionDeclaration = this.getFunctionDeclaration(codeData, expression.fullExpression)
        if (functionDeclaration != null && functionDeclaration.visibility === FunctionVisibility.Private) {
            // Found a local function. Look through this file's references
            return codeData.references.get(functionDeclaration.name)?.map(range => Location.create(uri, range)) ?? []
        }

        // Check other files
        const refs: Location[] = []
        for (const [, fileCodeData] of FileInfoIndex.codeDataCache) {
            if (fileCodeData.functions.get(expression.fullExpression)?.visibility === FunctionVisibility.Private) {
                // Skip files with other local functions
                continue
            }
            const varRefs = fileCodeData.references.get(expression.fullExpression)
            if (varRefs != null) {
                varRefs.forEach(range => refs.push(Location.create(fileCodeData.uri, range)))
            }
        }
        return refs
    }

    private getVariableDefsOrRefs (containingFunction: MatlabFunctionInfo, variableName: string, uri: string, requestType: RequestType): Location[] | null {
        const variableInfo = containingFunction.variableInfo.get(variableName)

        if (variableInfo == null) {
            return null
        }

        const varInfoRanges = requestType === RequestType.Definition ? variableInfo.definitions : variableInfo.references

        // TODO: How do we want to handle global variables?
        return varInfoRanges.map(range => {
            return Location.create(uri, range)
        })
    }

    private getFunctionDeclaration (codeData: MatlabCodeData, functionName: string): MatlabFunctionInfo | null {
        let functionDecl = codeData.functions.get(functionName)
        if (codeData.isClassDef && (functionDecl == null || functionDecl.isPrototype)) {
            // For classes, look in the methods list to better handle @folders
            functionDecl = codeData.classInfo?.methods.get(functionName) ?? functionDecl
        }

        return functionDecl ?? null
    }

    private getPropertyDeclaration (codeData: MatlabCodeData, propertyName: string): MatlabClassMemberInfo | null {
        if (codeData.classInfo == null) {
            return null
        }

        return codeData.classInfo.properties.get(propertyName) ?? null
    }

    private async findDefinitionOnPath (uri: string, position: Position, expression: Expression, matlabConnection: MatlabConnection): Promise<Location[] | null> {
        const resolvedPath = await PathResolver.resolvePaths([expression.targetExpression], uri, matlabConnection)
        const resolvedUri = resolvedPath[0].uri

        if (resolvedUri === '') {
            // Not found
            return null
        }

        // Ensure URI is not a directory. This can occur with some packages.
        const fileStats = await fs.stat(URI.parse(resolvedUri).fsPath)
        if (fileStats.isDirectory()) {
            return null
        }

        if (!FileInfoIndex.codeDataCache.has(resolvedUri)) {
            // Index target file, if necessary
            await Indexer.indexFile(resolvedUri)
        }

        const codeData = FileInfoIndex.codeDataCache.get(resolvedUri)

        if (codeData != null) {
            const definition = this.findDefinitionInCodeData(resolvedUri, position, expression, codeData)

            if (definition != null) {
                return definition
            }
        }

        return [Location.create(resolvedUri, Range.create(0, 0, 0, 0))]
    }

    private findDefinitionInWorkspace (uri: string, position: Position, expression: Expression): Location[] {
        const expressionToMatch = expression.fullExpression

        for (const [fileUri, fileCodeData] of FileInfoIndex.codeDataCache) {
            if (uri === fileUri) continue // Already looked in the current file

            let match = fileCodeData.packageName === '' ? '' : fileCodeData.packageName + '.'

            if (fileCodeData.classInfo != null) {
                const classUri = fileCodeData.classInfo.uri
                if (classUri == null) continue

                // Check class name
                match += fileCodeData.classInfo.name
                if (expressionToMatch === match) {
                    const range = fileCodeData.classInfo.declaration ?? Range.create(0, 0, 0, 0)
                    return [Location.create(classUri, range)]
                }

                // Check properties and enums
                for (const [propName, propData] of fileCodeData.classInfo.properties) {
                    const propMatch = match + '.' + propName
                    if (expressionToMatch === propMatch) {
                        return [Location.create(classUri, propData.range)]
                    }
                }

                for (const [enumName, enumData] of fileCodeData.classInfo.enumerations) {
                    const enumMatch = match + '.' + enumName
                    if (expressionToMatch === enumMatch) {
                        return [Location.create(classUri, enumData.range)]
                    }
                }
            }

            // Check functions
            for (const [funcName, funcData] of fileCodeData.functions) {
                const funcMatch = (match === '') ? funcName : match + '.' + funcName
                if (expressionToMatch === funcMatch) {
                    const range = funcData.declaration ?? Range.create(0, 0, 0, 0)
                    return [Location.create(funcData.uri, range)]
                }
            }
        }

        return []
    }
}

export default new NavigationSupportProvider()
