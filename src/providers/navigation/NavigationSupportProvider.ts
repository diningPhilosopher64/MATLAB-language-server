// Copyright 2022 - 2024 The MathWorks, Inc.

import { DefinitionParams, DocumentSymbolParams, Location, Position, Range, ReferenceParams, SymbolInformation, SymbolKind, TextDocuments } from 'vscode-languageserver'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { URI } from 'vscode-uri'
import * as fs from 'fs/promises'
import FileInfoIndex, { FunctionVisibility, MatlabClassMemberInfo, MatlabCodeData, MatlabFunctionInfo } from '../../indexing/FileInfoIndex'
import { MatlabConnection } from '../../lifecycle/MatlabCommunicationManager'
import LifecycleNotificationHelper from '../../lifecycle/LifecycleNotificationHelper'
import { ActionErrorConditions } from '../../logging/TelemetryUtils'
import NavigationBase, { Expression, RequestType, reportTelemetry } from '../helper-classes/NavigationBase'


class NavigationSupportProvider extends NavigationBase {
    /**
     * Handles requests for definitions or references.
     *
     * @param params Parameters for the definition or references request
     * @param documentManager The text document manager
     * @param requestType The type of request (definition or references)
     * @returns An array of locations
     */
    async handleDefOrRefRequest (params: DefinitionParams | ReferenceParams, documentManager: TextDocuments<TextDocument>, requestType: RequestType): Promise<Location[]> {
        const matlabConnection = await this.matlabLifecycleManager.getMatlabConnection(true)
        if (matlabConnection == null) {
            LifecycleNotificationHelper.notifyMatlabRequirement()
            reportTelemetry(requestType, ActionErrorConditions.MatlabUnavailable)
            return []
        }

        const uri = params.textDocument.uri
        const textDocument = documentManager.get(uri)

        if (textDocument == null) {
            reportTelemetry(requestType, 'No document')
            return []
        }

        // Find ID for which to find the definition or references
        const expression = this.getTarget(textDocument, params.position)

        if (expression == null) {
            // No target found
            reportTelemetry(requestType, 'No navigation target')
            return []
        }

        if (requestType === RequestType.Definition) {
            return await this.findDefinition(uri, params.position, expression, matlabConnection)
        } else {
            return this.findReferences(uri, params.position, expression)
        }
    }

    /**
     * Caches document symbols for URIs to deal with the case when indexing
     * temporarily fails while the user is in the middle of an edit. We might
     * consider moving logic like this into the indexer logic later as clearing
     * out index data in the middle of an edit will have other ill effects.
     */
    private readonly _documentSymbolCache = new Map<string, SymbolInformation[]>()

    /**
     *
     * @param params Parameters for the document symbol request
     * @param documentManager The text document manager
     * @param requestType The type of request
     * @returns Array of symbols found in the document
     */
    async handleDocumentSymbol (params: DocumentSymbolParams, documentManager: TextDocuments<TextDocument>, requestType: RequestType): Promise<SymbolInformation[]> {
        // Get or wait for the MATLAB connection to handle files opened before MATLAB is ready.
        // We do not want to trigger MATLAB to launch due to the frequency of this callback.
        // However, simply returning [] in this case could cause a delay between MATLAB started
        // and the symbols being identified.
        const matlabConnection = await new Promise<MatlabConnection | null>(async resolve => {
            if (this.matlabLifecycleManager.isMatlabConnected()) {
                resolve(await this.matlabLifecycleManager.getMatlabConnection())
            } else {
                // MATLAB is not already connected, so wait until it has connected to
                // resolve the connection.
                this.matlabLifecycleManager.eventEmitter.once('connected', async () => {
                    resolve(await this.matlabLifecycleManager.getMatlabConnection())
                })
            }
        })

        if (matlabConnection == null) {
            reportTelemetry(requestType, ActionErrorConditions.MatlabUnavailable)
            return []
        }

        const uri = params.textDocument.uri
        const textDocument = documentManager.get(uri)

        if (textDocument == null) {
            reportTelemetry(requestType, 'No document')
            return []
        }
        // Ensure document index is up to date
        await this.documentIndexer.ensureDocumentIndexIsUpdated(textDocument)
        const codeData = FileInfoIndex.codeDataCache.get(uri)
        if (codeData == null) {
            reportTelemetry(requestType, 'No code data')
            return []
        }
        // Result symbols in documented
        const result: SymbolInformation[] = []
        // Avoid duplicates coming from different data sources
        const visitedRanges: Set<Range> = new Set()
        /**
         * Push symbol info to result set
         */
        function pushSymbol (name: string, kind: SymbolKind, symbolRange: Range): void {
            if (!visitedRanges.has(symbolRange)) {
                result.push(SymbolInformation.create(name, kind, symbolRange, uri))
                visitedRanges.add(symbolRange)
            }
        }
        if (codeData.isMainClassDefDocument && codeData.classInfo != null) {
            const classInfo = codeData.classInfo
            if (codeData.classInfo.range != null) {
                pushSymbol(classInfo.name, SymbolKind.Class, codeData.classInfo.range)
            }
            classInfo.methods.forEach((info, name) => pushSymbol(name, SymbolKind.Method, info.range))
            classInfo.enumerations.forEach((info, name) => pushSymbol(name, SymbolKind.EnumMember, info.range))
            classInfo.properties.forEach((info, name) => pushSymbol(name, SymbolKind.Property, info.range))
        }
        codeData.functions.forEach((info, name) => pushSymbol(name, info.isClassMethod ? SymbolKind.Method : SymbolKind.Function, info.range))
        codeData.sections.forEach((range, title) => {
            range.forEach(range => {
                pushSymbol(title, SymbolKind.Module, range)
            })
        })

        /**
         * Handle a case when the indexer fails due to the user being in the middle of an edit.
         * Here the documentSymbol cache has some symbols but the codeData cache has none. So we
         * assume that the user will soon fix their code and just fall back to what we knew for now.
         */
        if (result.length === 0) {
            const cached = this._documentSymbolCache.get(uri) ?? result
            if (cached.length > 0) {
                return cached
            }
        }
        this._documentSymbolCache.set(uri, result)
        return result
    }

    /**
     * Finds the definition(s) of an expression.
     *
     * @param uri The URI of the document containing the expression
     * @param position The position of the expression
     * @param expression The expression for which we are looking for the definition
     * @param matlabConnection The connection to MATLAB®
     * @returns The definition location(s)
     */
    private async findDefinition (uri: string, position: Position, expression: Expression, matlabConnection: MatlabConnection): Promise<Location[]> {
        // Get code data for current file
        const codeData = FileInfoIndex.codeDataCache.get(uri)

        if (codeData == null) {
            // File not indexed - unable to look for definition
            reportTelemetry(RequestType.Definition, 'File not indexed')
            return []
        }

        // First check within the current file's code data
        const definitionInCodeData = this.findDefinitionInCodeData(uri, position, expression, codeData)

        if (definitionInCodeData != null) {
            reportTelemetry(RequestType.Definition)
            return definitionInCodeData
        }

        // Check the MATLAB path
        const definitionOnPath = await this.findDefinitionOnPath(uri, position, expression, matlabConnection)

        if (definitionOnPath != null) {
            reportTelemetry(RequestType.Definition)
            return definitionOnPath
        }

        // If not on path, may be in user's workspace
        reportTelemetry(RequestType.Definition)
        return this.findDefinitionInWorkspace(uri, expression)
    }

    /**
     * Searches the given code data for the definition(s) of the given expression
     *
     * @param uri The URI corresponding to the provided code data
     * @param position The position of the expression
     * @param expression The expression for which we are looking for the definition
     * @param codeData The code data which is being searched
     * @returns The definition location(s), or null if no definition was found
     */
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
            return [this.getLocationForFunctionDeclaration(functionDeclaration)]
        }

        // Check for definitions within classes
        if (codeData.isClassDef && codeData.classInfo != null) {
            // Look for methods/properties within class definitions (e.g. obj.foo)
            functionDeclaration = this.getFunctionDeclaration(codeData, expression.last)
            if (functionDeclaration != null) {
                return [this.getLocationForFunctionDeclaration(functionDeclaration)]
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

    /**
     * Gets the location of the given function's declaration. If the function does not have
     * a definite declaration, provides a location at the beginning of the file. For example,
     * this may be the case for built-in functions like 'plot'.
     *
     * @param functionInfo Info about the function
     * @returns The location of the function declaration
     */
    private getLocationForFunctionDeclaration (functionInfo: MatlabFunctionInfo): Location {
        const range = functionInfo.declaration ?? Range.create(0, 0, 0, 0)
        return Location.create(functionInfo.uri, range)
    }

    /**
     * Searches the MATLAB path for the definition of the given expression
     *
     * @param uri The URI of the file containing the expression
     * @param position The position of the expression
     * @param expression The expression for which we are looking for the definition
     * @param matlabConnection The connection to MATLAB
     * @returns The definition location(s), or null if no definition was found
     */
    private async findDefinitionOnPath (uri: string, position: Position, expression: Expression, matlabConnection: MatlabConnection): Promise<Location[] | null> {
        const resolvedPath = await this.pathResolver.resolvePaths([expression.targetExpression], uri, matlabConnection)
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
            await this.indexer.indexFile(resolvedUri)
        }

        const codeData = FileInfoIndex.codeDataCache.get(resolvedUri)

        // Find definition location within determined file
        if (codeData != null) {
            const definition = this.findDefinitionInCodeData(resolvedUri, position, expression, codeData)

            if (definition != null) {
                return definition
            }
        }

        // If a definition location cannot be identified, default to the beginning of the file.
        // This could be the case for builtin functions which don't actually have a definition in a .m file (e.g. plot).
        return [Location.create(resolvedUri, Range.create(0, 0, 0, 0))]
    }

    /**
     * Searches the (indexed) workspace for the definition of the given expression. These files may not be on the MATLAB path.
     *
     * @param uri The URI of the file containing the expression
     * @param expression The expression for which we are looking for the definition
     * @returns The definition location(s). Returns an empty array if no definitions found.
     */
    private findDefinitionInWorkspace (uri: string, expression: Expression): Location[] {
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

                // Check properties
                const matchedProperty = this.findMatchingClassMember(expressionToMatch, match, classUri, fileCodeData.classInfo.properties)
                if (matchedProperty != null) {
                    return matchedProperty
                }

                // Check enums
                const matchedEnum = this.findMatchingClassMember(expressionToMatch, match, classUri, fileCodeData.classInfo.enumerations)
                if (matchedEnum != null) {
                    return matchedEnum
                }
            }

            // Check functions
            for (const [funcName, funcData] of fileCodeData.functions) {
                const funcMatch = (match === '') ? funcName : match + '.' + funcName

                // Need to ensure that a function with a matching name should also be visible from the current file.
                if (expressionToMatch === funcMatch && this.isFunctionVisibleFromUri(uri, funcData)) {
                    const range = funcData.declaration ?? Range.create(0, 0, 0, 0)
                    return [Location.create(funcData.uri, range)]
                }
            }
        }

        return []
    }

    /**
     * Finds the class member (property or enumeration) in the given map which matches to given expression.
     *
     * @param expressionToMatch The expression being compared against
     * @param matchPrefix The prefix which should be attached to the class members before comparison
     * @param classUri The URI for the current class
     * @param classMemberMap The map of class members
     * @returns An array containing the location of the matched class member, or null if one was not found
     */
    private findMatchingClassMember (expressionToMatch: string, matchPrefix: string, classUri: string, classMemberMap: Map<string, MatlabClassMemberInfo>): Location[] | null {
        for (const [memberName, memberData] of classMemberMap) {
            const match = matchPrefix + '.' + memberName
            if (expressionToMatch === match) {
                return [Location.create(classUri, memberData.range)]
            }
        }

        return null
    }

    /**
     * Determines whether the given function should be visible from the given file URI.
     * The function is visible if it is contained within the same file, or is public.
     *
     * @param uri The file's URI
     * @param funcData The function data
     * @returns true if the function should be visible from the given URI; false otherwise
     */
    private isFunctionVisibleFromUri (uri: string, funcData: MatlabFunctionInfo): boolean {
        return uri === funcData.uri || funcData.visibility === FunctionVisibility.Public
    }
}

export default NavigationSupportProvider
