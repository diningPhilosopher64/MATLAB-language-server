import { TextDocument } from 'vscode-languageserver-textdocument'
import { URI } from 'vscode-uri'
import { MatlabConnection } from '../lifecycle/MatlabCommunicationManager'
import MatlabLifecycleManager from '../lifecycle/MatlabLifecycleManager'
import FileInfoIndex, { RawCodeData } from './FileInfoIndex'

const INDEXING_DELAY = 500 // Delay (in ms) after keystroke before attempting to re-index the document

/**
 * Handles indexing a currently open document to gather data about classes,
 * functions, and variables.
 */
class DocumentIndexer {
    private readonly REQUEST_CHANNEL = '/matlabls/indexDocument/request'
    private readonly RESPONSE_CHANNEL = '/matlabls/indexDocument/response'

    private readonly pendingFilesToIndex = new Map<string, NodeJS.Timer>()

    /**
     * Queues a document to be indexed. This handles debouncing so that
     * indexing is not performed on every keystroke.
     *
     * @param textDocument The document to be indexed
     */
    queueIndexingForDocument (textDocument: TextDocument): void {
        const uri = textDocument.uri
        this.clearTimerForDocumentUri(uri)
        this.pendingFilesToIndex.set(
            uri,
            setTimeout(() => {
                void this.indexDocument(textDocument)
            }, INDEXING_DELAY) // Specify timeout for debouncing, to avoid re-indexing every keystroke while a user types
        )
    }

    /**
     * Indexes the document and caches the data.
     *
     * @param textDocument The document being indexed
     */
    async indexDocument (textDocument: TextDocument): Promise<void> {
        const matlabConnection = MatlabLifecycleManager.getMatlabConnection()

        if (matlabConnection == null || !MatlabLifecycleManager.isMatlabReady()) {
            return
        }

        const rawCodeData = await this.getCodeDataForDocument(textDocument, matlabConnection)
        FileInfoIndex.parseAndStoreCodeData(textDocument.uri, rawCodeData)
    }

    /**
     * Retrieves data about classes, functions, and variables from the given document.
     *
     * @param textDocument The document being indexed
     * @param matlabConnection The connection to MATLAB
     *
     * @returns The raw data extracted from the document
     */
    private async getCodeDataForDocument (textDocument: TextDocument, matlabConnection: MatlabConnection): Promise<RawCodeData> {
        const code = textDocument.getText()
        const filePath = URI.parse(textDocument.uri).fsPath

        return await new Promise(resolve => {
            const responseSub = matlabConnection.subscribe(this.RESPONSE_CHANNEL, message => {
                matlabConnection.unsubscribe(responseSub)

                resolve(message as RawCodeData)
            })

            matlabConnection.publish(this.REQUEST_CHANNEL, {
                code,
                filePath
            })
        })
    }

    /**
     * Clears any active indexing timers for the provided document URI.
     *
     * @param uri The document URI
     */
    private clearTimerForDocumentUri (uri: string): void {
        const timerId = this.pendingFilesToIndex.get(uri)
        if (timerId != null) {
            clearTimeout(timerId)
            this.pendingFilesToIndex.delete(uri)
        }
    }
}

export default new DocumentIndexer()
