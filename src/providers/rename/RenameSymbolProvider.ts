// Copyright 2024 The MathWorks, Inc.

import { WorkspaceEdit, PrepareRenameParams, RenameParams, Range, TextDocuments, TextEdit } from 'vscode-languageserver'
import { TextDocument } from 'vscode-languageserver-textdocument'
import LifecycleNotificationHelper from '../../lifecycle/LifecycleNotificationHelper'
import { getTextOnLine } from '../../utils/TextDocumentUtils'
import FileInfoIndex from '../../indexing/FileInfoIndex'
import { ActionErrorConditions } from '../../logging/TelemetryUtils'
import { getExpressionAtPosition } from '../../utils/ExpressionUtils'
import SymbolSearchService, { RequestType, reportTelemetry} from '../../indexing/SymbolSearchService'
import MatlabLifecycleManager from '../../lifecycle/MatlabLifecycleManager'
import DocumentIndexer from '../../indexing/DocumentIndexer'

class RenameSymbolProvider {
    constructor (
        protected matlabLifecycleManager: MatlabLifecycleManager,
        protected documentIndexer: DocumentIndexer,
    ) {}

    async prepareRename (params: PrepareRenameParams, documentManager: TextDocuments<TextDocument>): Promise<{ range: Range; placeholder: string } | null> {
        const matlabConnection = await this.matlabLifecycleManager.getMatlabConnection(true)
        if (matlabConnection == null) {
            LifecycleNotificationHelper.notifyMatlabRequirement()
            reportTelemetry(RequestType.RenameSymbol, ActionErrorConditions.MatlabUnavailable)
            return null
        }
        
        const uri = params.textDocument.uri
        const textDocument = documentManager.get(uri)
        
        if (textDocument == null) {
            reportTelemetry(RequestType.RenameSymbol, 'No document')
            return null
        }

        const text = textDocument.getText()
        const offset = textDocument.offsetAt(params.position)

        // Find the start of the word
        let startOffset = offset;
        while (startOffset > 0 && /\w/.test(text.charAt(startOffset - 1))) {
            startOffset--
        }

        // Find the end of the word
        let endOffset = offset;
        while (endOffset < text.length && /\w/.test(text.charAt(endOffset))) {
            endOffset++
        }

        if (startOffset === endOffset) {
            return null
        }

        const startPosition = textDocument.positionAt(startOffset)
        const endPosition = textDocument.positionAt(endOffset)
        const range = Range.create(startPosition, endPosition)

        // Find ID for which to find the definition or references
        const expression = getExpressionAtPosition(textDocument, params.position)
        if (expression == null) {
            reportTelemetry(RequestType.RenameSymbol, 'No rename target')
            return null
        }

        if (expression.fullExpression.trim().length === 0) {
            return null
        }

        if (SymbolSearchService.findReferences(uri, params.position, expression, documentManager, RequestType.RenameSymbol).length === 0) {
            return null
        }

        return { range, placeholder: expression.unqualifiedTarget }
    }

    /**
     * Handles requests for renaming.
     *
     * @param params Parameters for the rename request
     * @param documentManager The text document manager
     * @returns An array of locations
     */
    async handleRenameRequest (params: RenameParams, documentManager: TextDocuments<TextDocument>): Promise<WorkspaceEdit | null> {
        const matlabConnection = await this.matlabLifecycleManager.getMatlabConnection(true)
        if (matlabConnection == null) {
            LifecycleNotificationHelper.notifyMatlabRequirement()
            reportTelemetry(RequestType.RenameSymbol, ActionErrorConditions.MatlabUnavailable)
            return null
        }

        const uri = params.textDocument.uri
        const textDocument = documentManager.get(uri)

        if (textDocument == null) {
            reportTelemetry(RequestType.RenameSymbol, 'No document')
            return null
        }

        // Find ID for which to find the definition or references
        const expression = getExpressionAtPosition(textDocument, params.position)
        if (expression == null) {
            reportTelemetry(RequestType.RenameSymbol, 'No rename target')
            return null
        }

        // Ensure document index is up to date
        await this.documentIndexer.ensureDocumentIndexIsUpdated(textDocument)
        const codeData = FileInfoIndex.codeDataCache.get(uri)
        if (codeData == null) {
            reportTelemetry(RequestType.RenameSymbol, 'No code data')
            return null
        }

        const refs = SymbolSearchService.findReferences(uri, params.position, expression, documentManager, RequestType.RenameSymbol)
        const workspaceEdit: WorkspaceEdit = {
            changes: {
                [uri]: []
            }
        }

        refs.forEach(location => {
            const range: Range = {
                start: {
                    line: location.range.start.line,
                    character: location.range.start.character
                },
                end: {
                    line: location.range.end.line,
                    character: location.range.end.character
                }
            }

            if (expression.components.length > 1 && expression.selectedComponent !== 0) {
                let newName = expression.components.slice()
                newName[expression.selectedComponent] = params.newName
                const newEdit: TextEdit = {
                    range: range,
                    newText: newName.join('.')
                }
                if (location.uri === uri && workspaceEdit.changes) {
                    workspaceEdit.changes[uri].push(newEdit)
                }
            } else {
                const newEdit: TextEdit = {
                    range: range,
                    newText: params.newName
                }
                if (location.uri === uri && workspaceEdit.changes) {
                    workspaceEdit.changes[uri].push(newEdit)
                }
            }
        })

        // Check if there is a class definition and rename as necessary
        if (codeData.isClassDef && codeData.classInfo && codeData.classInfo.declaration) {
            const lineNumber = codeData.classInfo.declaration.start.line
            const declaration = getTextOnLine(textDocument, lineNumber)
            if (declaration.split(/\s+/).includes(expression.fullExpression)) {
                const range: Range = {
                    start: {
                        line: lineNumber,
                        character: 9
                    },
                    end: {
                        line: lineNumber,
                        character: declaration.length - 1
                    }
                }
                const newEdit: TextEdit = {
                    range: range,
                    newText: params.newName
                }
                if (workspaceEdit.changes) {
                    workspaceEdit.changes[uri].push(newEdit)
                }
            }
        }

        // Checks if properties need to be renamed
        let propertyInfo = SymbolSearchService.getPropertyDeclaration(codeData, expression.unqualifiedTarget)
        if (propertyInfo != null && expression.components.length > 1) {
            const newEdit: TextEdit = {
                range: propertyInfo.range,
                newText: params.newName
            }
            if (workspaceEdit.changes) {
                workspaceEdit.changes[uri].push(newEdit)
            }
        }

        const edit: WorkspaceEdit = workspaceEdit
        return edit
    }
}

export default RenameSymbolProvider
