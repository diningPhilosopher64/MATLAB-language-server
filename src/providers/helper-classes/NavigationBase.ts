import { Location, Position } from 'vscode-languageserver'
import { TextDocument } from 'vscode-languageserver-textdocument'
import FileInfoIndex, { FunctionVisibility, MatlabClassMemberInfo, MatlabCodeData, MatlabFunctionInfo } from '../../indexing/FileInfoIndex'
import Indexer from '../../indexing/Indexer'
import MatlabLifecycleManager from '../../lifecycle/MatlabLifecycleManager'
import { getTextOnLine } from '../../utils/TextDocumentUtils'
import PathResolver from '../navigation/PathResolver'
import DocumentIndexer from '../../indexing/DocumentIndexer'
// import { Expression, RequestType, reportTelemetry } from './Expression'
import { Actions, reportTelemetryAction } from '../../logging/TelemetryUtils'

/**
 * Represents a code expression, either a single identifier or a dotted expression.
 * For example, "plot" or "pkg.Class.func".
 */
export class Expression {
    constructor (public components: string[], public selectedComponent: number) {}

    /**
     * The full, dotted expression
     */
    get fullExpression (): string {
        return this.components.join('.')
    }

    /**
     * The dotted expression up to and including the selected component
     */
    get targetExpression (): string {
        return this.components.slice(0, this.selectedComponent + 1).join('.')
    }

    /**
     * Only the selected component of the expression
     */
    get unqualifiedTarget (): string {
        return this.components[this.selectedComponent]
    }

    /**
     * The first component of the expression
     */
    get first (): string {
        return this.components[0]
    }

    /**
     * The last component of the expression
     */
    get last (): string {
        return this.components[this.components.length - 1]
    }
}

export enum RequestType {
    Definition,
    References,
    DocumentSymbol
}

export function reportTelemetry (type: RequestType, errorCondition = ''): void {
    let action: Actions
    switch (type) {
        case RequestType.Definition:
            action = Actions.GoToDefinition
            break
        case RequestType.References:
            action = Actions.GoToReference
            break
        case RequestType.DocumentSymbol:
            action = Actions.DocumentSymbol
            break
    }
    reportTelemetryAction(action, errorCondition)
}

abstract class NavigationBase {
    protected readonly DOTTED_IDENTIFIER_REGEX = /[\w.]+/

    constructor (
        protected matlabLifecycleManager: MatlabLifecycleManager,
        protected indexer: Indexer,
        protected documentIndexer: DocumentIndexer,
        protected pathResolver: PathResolver
    ) {}

    /**
     * Gets the definition/references request target expression.
     *
     * @param textDocument The text document
     * @param position The position in the document
     * @returns The expression at the given position, or null if no expression is found
     */
    protected getTarget (textDocument: TextDocument, position: Position): Expression | null {
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

    /**
     * Determines the identifier (or dotted expression) at the given position in the document.
     *
     * @param textDocument The text document
     * @param position The position in the document
     * @returns An object containing the string identifier at the position, as well as the column number at which the identifier starts.
     */
    protected getIdentifierAtPosition (textDocument: TextDocument, position: Position): { identifier: string, start: number } {
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

    /**
     * Finds references of an expression.
     *
     * @param uri The URI of the document containing the expression
     * @param position The position of the expression
     * @param expression The expression for which we are looking for references
     * @returns The references' locations
     */
    protected findReferences (uri: string, position: Position, expression: Expression): Location[] {
        // Get code data for current file
        const codeData = FileInfoIndex.codeDataCache.get(uri)

        if (codeData == null) {
            // File not indexed - unable to look for references
            reportTelemetry(RequestType.References, 'File not indexed')
            return []
        }

        const referencesInCodeData = this.findReferencesInCodeData(uri, position, expression, codeData)

        reportTelemetry(RequestType.References)

        if (referencesInCodeData != null) {
            return referencesInCodeData
        }

        return []
    }

    /**
     * Searches for references, starting within the given code data. If the expression does not correspond to a local variable,
     *  the search is broadened to other indexed files in the user's workspace.
     *
     * @param uri The URI corresponding to the provided code data
     * @param position The position of the expression
     * @param expression The expression for which we are looking for references
     * @param codeData The code data which is being searched
     * @returns The references' locations, or null if no reference was found
     */
    protected findReferencesInCodeData (uri: string, position: Position, expression: Expression, codeData: MatlabCodeData): Location[] | null {
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

    /**
     * Gets the definition/references of a variable within a function.
     *
     * @param containingFunction Info about a function
     * @param variableName The variable name for which we are looking for definitions or references
     * @param uri The URI of the file
     * @param requestType The type of request (definition or references)
     * @returns The locations of the definition(s) or references of the given variable name within the given function info, or null if none can be found
     */
    protected getVariableDefsOrRefs (containingFunction: MatlabFunctionInfo, variableName: string, uri: string, requestType: RequestType): Location[] | null {
        const variableInfo = containingFunction.variableInfo.get(variableName)

        if (variableInfo == null) {
            return null
        }

        const varInfoRanges = requestType === RequestType.Definition ? variableInfo.definitions : variableInfo.references

        return varInfoRanges.map(range => {
            return Location.create(uri, range)
        })
    }

    /**
     * Searches for info about a function within the given code data.
     *
     * @param codeData The code data being searched
     * @param functionName The name of the function being searched for
     * @returns The info about the desired function, or null if it cannot be found
     */
    protected getFunctionDeclaration (codeData: MatlabCodeData, functionName: string): MatlabFunctionInfo | null {
        let functionDecl = codeData.functions.get(functionName)
        if (codeData.isClassDef && (functionDecl == null || functionDecl.isPrototype)) {
            // For classes, look in the methods list to better handle @folders
            functionDecl = codeData.classInfo?.methods.get(functionName) ?? functionDecl
        }

        return functionDecl ?? null
    }

    /**
     * Searches for info about a property within the given code data.
     *
     * @param codeData The code data being searched
     * @param propertyName The name of the property being searched for
     * @returns The info about the desired property, or null if it cannot be found
     */
    protected getPropertyDeclaration (codeData: MatlabCodeData, propertyName: string): MatlabClassMemberInfo | null {
        if (codeData.classInfo == null) {
            return null
        }

        return codeData.classInfo.properties.get(propertyName) ?? null
    }

}

export default NavigationBase