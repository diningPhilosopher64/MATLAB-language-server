import { Definition, DefinitionParams, Location, Position, Range, TextDocuments } from 'vscode-languageserver'
import { TextDocument } from 'vscode-languageserver-textdocument'
import FileInfoIndex, { MatlabClassMemberInfo, MatlabCodeData, MatlabFunctionInfo } from '../../indexing/FileInfoIndex'
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

class NavigationSupportProvider {
    private readonly DOTTED_IDENTIFIER_REGEX = /[\w.]+/ // Does this need to be more specific? Like /[_a-zA-Z]\w*(?:\.[\w]+)*/

    async handleDefinitionRequest (params: DefinitionParams, documentManager: TextDocuments<TextDocument>): Promise<Definition> {
        const matlabConnection = MatlabLifecycleManager.getMatlabConnection()
        if (matlabConnection == null) {
            return []
        }

        const uri = params.textDocument.uri
        const textDocument = documentManager.get(uri)

        if (textDocument == null) {
            return []
        }

        // Find ID for which to find the definition
        const expression = this.getDefinitionTarget(textDocument, params.position)

        if (expression == null) {
            // No target found
            return []
        }

        return await this.findDefinition(uri, params.position, expression, matlabConnection)
    }

    private getDefinitionTarget (textDocument: TextDocument, position: Position): Expression | null {
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

    private async findDefinition (uri: string, position: Position, expression: Expression, matlabConnection: MatlabConnection): Promise<Definition> {
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

        // Fall back to the MATLAB path
        return await this.findDefinitionOnPath(uri, position, expression, matlabConnection)
    }

    private findDefinitionInCodeData (uri: string, position: Position, expression: Expression, codeData: MatlabCodeData): Definition | null {
        // If first part of expression targeted - look for a local variable
        if (expression.selectedComponent === 0) {
            const containingFunction = codeData.findContainingFunction(position)
            if (containingFunction != null) {
                const varDefs = this.getVariableDefinitions(containingFunction, expression.unqualifiedTarget, uri)
                if (varDefs != null) {
                    return varDefs
                }
            }
        }

        // Check for functions in file
        let functionDeclaration = this.getFunctionDeclaration(codeData, expression.fullExpression)
        if (functionDeclaration != null) {
            const functionRange = functionDeclaration.declaration ?? Range.create(0, 0, 0, 0)
            return Location.create(functionDeclaration.uri, functionRange)
        }

        // Check for definitions within classes
        if (codeData.isClassDef && codeData.classInfo != null) {
            // Look for methods/properties within class definitions (e.g. obj.foo)
            functionDeclaration = this.getFunctionDeclaration(codeData, expression.last)
            if (functionDeclaration != null) {
                const functionRange = functionDeclaration.declaration ?? Range.create(0, 0, 0, 0)
                return Location.create(functionDeclaration.uri, functionRange)
            }

            // Look for possible properties
            if (expression.selectedComponent === 1) {
                const propertyDeclaration = this.getPropertyDeclaration(codeData, expression.last)
                if (propertyDeclaration != null) {
                    const propertyRange = Range.create(propertyDeclaration.range.start, propertyDeclaration.range.end)
                    const uri = codeData.classInfo.uri
                    if (uri != null) {
                        return Location.create(uri, propertyRange)
                    }
                }
            }
        }

        return null
    }

    private getVariableDefinitions (containingFunction: MatlabFunctionInfo, variableName: string, uri: string): Definition | null {
        const variableInfo = containingFunction.variableInfo.get(variableName)

        if (variableInfo == null) {
            return null
        }

        // TODO: How do we want to handle global variables?
        return variableInfo.definitions.map(defRange => {
            return Location.create(uri, defRange)
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

    private async findDefinitionOnPath (uri: string, position: Position, expression: Expression, matlabConnection: MatlabConnection): Promise<Definition> {
        const resolvedPath = await PathResolver.resolvePaths([expression.targetExpression], uri, matlabConnection)
        const resolvedUri = resolvedPath[0].uri

        if (resolvedUri === '') {
            // Not found
            return []
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

        return Location.create(resolvedUri, Range.create(0, 0, 0, 0))
    }
}

export default new NavigationSupportProvider()
