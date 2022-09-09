import { ExecuteCommandParams, Range, TextDocumentEdit, TextDocuments, VersionedTextDocumentIdentifier, WorkspaceEdit, _Connection } from 'vscode-languageserver'
import { TextDocument } from 'vscode-languageserver-textdocument'
import LintingSupportProvider from '../linting/LintingSupportProvider'

interface LintFilterArgs {
    id: string
    range: Range
    uri: string
}

export const MatlabLSCommands = {
    MLINT_FILTER_LINE: 'matlabls.lint.filter.line',
    MLINT_FILTER_FILE: 'matlabls.lint.filter.file'
}

/**
 * Handles requests to execute commands
 */
class ExecuteCommandProvider {
    /**
     * Handles command execution requests.
     *
     * @param params Parameters from the onExecuteCommand request
     * @param documentManager The text document manager
     * @param connection The language server connection
     */
    async handleExecuteCommand (params: ExecuteCommandParams, documentManager: TextDocuments<TextDocument>, connection: _Connection): Promise<void> {
        switch (params.command) {
            case MatlabLSCommands.MLINT_FILTER_LINE:
            case MatlabLSCommands.MLINT_FILTER_FILE:
                void this.handleLintingFilter(params, documentManager, connection)
        }
    }

    /**
     * Handles command to filter a linting diagnostic.
     *
     * @param params Parameters from the onExecuteCommand request
     * @param documentManager The text document manager
     * @param connection The language server connection
     */
    private async handleLintingFilter (params: ExecuteCommandParams, documentManager: TextDocuments<TextDocument>, connection: _Connection): Promise<void> {
        const args = params.arguments?.[0] as LintFilterArgs
        const range = args.range
        const uri = args.uri
        const doc = documentManager.get(uri)

        if (doc == null) {
            return
        }

        const isFilterFile = params.command === MatlabLSCommands.MLINT_FILTER_FILE
        const textEdits = await LintingSupportProvider.filterDiagnostic(doc, range, args.id, isFilterFile)

        const edit: WorkspaceEdit = {
            changes: {
                [uri]: textEdits
            },
            documentChanges: [
                TextDocumentEdit.create(
                    VersionedTextDocumentIdentifier.create(uri, doc.version),
                    textEdits
                )
            ]
        }

        void connection.workspace.applyEdit(edit)
    }
}

export default new ExecuteCommandProvider()
