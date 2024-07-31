// Copyright 2022 - 2024 The MathWorks, Inc.

import { WorkspaceEdit, RenameParams, Range, TextDocuments } from 'vscode-languageserver'
import { TextDocument } from 'vscode-languageserver-textdocument'
import LifecycleNotificationHelper from '../../lifecycle/LifecycleNotificationHelper'
import NavigationBase from '../helper-classes/NavigationBase'


interface TextEdit {
    range: Range;
    newText: string;
}

interface EditJson {
    changes: {
        [uri: string]: TextEdit[];
    };
}

class RenameSymbolProvider extends NavigationBase {
    /**
     * Handles requests for renaming.
     *
     * @param params Parameters for the rename request
     * @param documentManager The text document manager
     * @returns An array of locations
     */
    async handleRenameRequest (params: RenameParams, documentManager: TextDocuments<TextDocument>): Promise<WorkspaceEdit | null | undefined> {
        const matlabConnection = await this.matlabLifecycleManager.getMatlabConnection(true)
        if (matlabConnection == null) {
            LifecycleNotificationHelper.notifyMatlabRequirement()
            return null
        }

        const uri = params.textDocument.uri
        const textDocument = documentManager.get(uri)

        if (textDocument == null) {
            return null
        }

        // Find ID for which to find the definition or references
        const expression = this.getTarget(textDocument, params.position)
        if (expression == null) {
            return null
        }

        const refs = this.findReferences(uri, params.position, expression)
        const editJson: EditJson = {
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
            const newEdit: TextEdit = {
                range: range,
                newText: params.newName
            }

            if (location.uri === uri) {
                editJson.changes[uri].push(newEdit)
            }
        })

        // Check if there is a class definition and rename as necessary
        const text = textDocument.getText()
        let pos = 0
        for (let i = 0; i < text.length; i++) {
            if (text.charAt(i) === '\r') {
                pos = i
                break
            }
        }
        const firstLine = text.substring(0, pos)
        if (firstLine.includes('classdef ') && firstLine.substring(9, firstLine.length - 1) === expression.fullExpression) {
            const range: Range = {
                start: {
                    line: 0,
                    character: 9
                },
                end: {
                    line: 0,
                    character: firstLine.length - 1
                }
            }
            const newEdit: TextEdit = {
                range: range,
                newText: params.newName
            }
            editJson.changes[uri].push(newEdit)
        }

        const edit: WorkspaceEdit = editJson
        return edit
    }
}

export default RenameSymbolProvider
