// Copyright 2024 The MathWorks, Inc.

import { Location, Position, TextDocuments } from 'vscode-languageserver'
import { TextDocument } from 'vscode-languageserver-textdocument'
import FileInfoIndex, { FunctionVisibility, MatlabClassMemberInfo, MatlabCodeData, MatlabFunctionInfo } from './FileInfoIndex'
import { Actions, reportTelemetryAction } from '../logging/TelemetryUtils'
import Expression from '../utils/ExpressionUtils'
import { getTextOnLine } from '../utils/TextDocumentUtils'

export enum RequestType {
    Definition,
    References,
    DocumentSymbol,
    RenameSymbol,
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
        case RequestType.RenameSymbol:
            action = Actions.RenameSymbol
            break
    }
    reportTelemetryAction(action, errorCondition)
}

class SymbolSearchService {
    private static instance: SymbolSearchService
    protected readonly DOTTED_IDENTIFIER_REGEX = /[\w.]+/

    public static getInstance (): SymbolSearchService {
        if (SymbolSearchService.instance == null) {
            SymbolSearchService.instance = new SymbolSearchService()
        }

        return SymbolSearchService.instance
    }

    /**
     * Finds references of an expression.
     *
     * @param uri The URI of the document containing the expression
     * @param position The position of the expression
     * @param expression The expression for which we are looking for references
     * @param documentManager The text document manager
     * @param requestType The type of request (definition, references, or rename)
     * @returns The references' locations
     */
    findReferences (uri: string, position: Position, expression: Expression, documentManager: TextDocuments<TextDocument>, requestType: RequestType): Location[] {
        // Get code data for current file
        const codeData = FileInfoIndex.codeDataCache.get(uri)

        if (codeData == null) {
            // File not indexed - unable to look for references
            reportTelemetry(requestType, 'File not indexed')
            return []
        }

        const textDocument = documentManager.get(uri)

        if (textDocument == null) {
            reportTelemetry(requestType, 'No document')
            return []
        }

        const line = getTextOnLine(textDocument, position.line)
        const commentStart = line.indexOf('%')

        if (commentStart > -1 && commentStart < position.character) {
            // Current expression is in a comment - no references should be returned
            return []
        }

        const referencesInCodeData = this.findReferencesInCodeData(uri, position, expression, codeData)

        reportTelemetry(requestType)

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

    /**
     * Gets the definition/references of a variable within a function.
     *
     * @param containingFunction Info about a function
     * @param variableName The variable name for which we are looking for definitions or references
     * @param uri The URI of the file
     * @param requestType The type of request (definition or references)
     * @returns The locations of the definition(s) or references of the given variable name within the given function info, or null if none can be found
     */
    getVariableDefsOrRefs (containingFunction: MatlabFunctionInfo, variableName: string, uri: string, requestType: RequestType): Location[] | null {
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
    getFunctionDeclaration (codeData: MatlabCodeData, functionName: string): MatlabFunctionInfo | null {
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
    getPropertyDeclaration (codeData: MatlabCodeData, propertyName: string): MatlabClassMemberInfo | null {
        if (codeData.classInfo == null) {
            return null
        }

        return codeData.classInfo.properties.get(propertyName) ?? null
    }
}

export default SymbolSearchService.getInstance()
