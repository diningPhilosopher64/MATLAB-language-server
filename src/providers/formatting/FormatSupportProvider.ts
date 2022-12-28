
import { DocumentFormattingParams, HandlerResult, Position, Range, TextDocuments, TextEdit, _Connection } from 'vscode-languageserver'
import { TextDocument } from 'vscode-languageserver-textdocument'
import ConfigurationManager from '../../lifecycle/ConfigurationManager'
import LifecycleNotificationHelper from '../../lifecycle/LifecycleNotificationHelper'
import MatlabLifecycleManager from '../../lifecycle/MatlabLifecycleManager'
import * as TextDocumentUtils from '../../utils/TextDocumentUtils'

interface FormatDocumentResponse {
    data: string // The formatted document contents
}

/**
 * Handles requests for format-related features.
 * Currently, this handles formatting the entire document. In the future, this may be expanded to
 * include formatting a range witin the documemt.
 */
class FormatSupportProvider {
    private readonly REQUEST_CHANNEL = '/matlabls/formatDocument/request'
    private readonly RESPONSE_CHANNEL = '/matlabls/formatDocument/response'

    /**
     * Handles a request for document formatting.
     *
     * @param params Parameters from the onDocumentFormatting request
     * @param documentManager The text document manager
     * @param connection The language server connection
     * @returns An array of text edits required for the formatting operation, or null if the operation cannot be performed
     */
    async handleDocumentFormatRequest (params: DocumentFormattingParams, documentManager: TextDocuments<TextDocument>, connection: _Connection): Promise<HandlerResult<TextEdit[] | null | undefined, void>> {
        const docToFormat = documentManager.get(params.textDocument.uri)
        if (docToFormat == null) {
            return null
        }

        return await this.formatDocument(docToFormat, connection)
    }

    /**
     * Determines the edits required to format the given document.
     *
     * @param doc The document being formatted
     * @param connection The language server connection
     * @returns An array of text edits required to format the document
     */
    private async formatDocument (doc: TextDocument, connection: _Connection): Promise<TextEdit[]> {
        // For format, we try to instantiate MATLAB if it is not already running
        const matlabConnection = await MatlabLifecycleManager.getOrCreateMatlabConnection(connection)

        // If MATLAB is not available, no-op
        if (matlabConnection == null || !MatlabLifecycleManager.isMatlabReady()) {
            LifecycleNotificationHelper.notifyMatlabRequirement()
            return []
        }

        const editorConfiguration = (await ConfigurationManager.getConfiguration(doc.uri)).editor
        const insertSpaces = editorConfiguration.insertSpaces ?? true
        const tabSize = editorConfiguration.tabSize ?? 4
        const indentSize = (editorConfiguration.indentSize ?? 'tabSize') === 'tabSize' ? tabSize : editorConfiguration.indentSize

        return await new Promise<TextEdit[]>(resolve => {
            const responseSub = matlabConnection.subscribe(this.RESPONSE_CHANNEL, message => {
                matlabConnection.unsubscribe(responseSub)
                const newCode = (message as FormatDocumentResponse).data
                const endRange = TextDocumentUtils.getRangeUntilLineEnd(doc, doc.lineCount - 1, 0)
                const edit = TextEdit.replace(Range.create(
                    Position.create(0, 0),
                    endRange.end
                ), newCode)
                resolve([edit])
            })

            matlabConnection.publish(this.REQUEST_CHANNEL, {
                data: doc.getText(),
                insertSpaces,
                tabSize,
                indentSize
            })
        })
    }
}

export default new FormatSupportProvider()
