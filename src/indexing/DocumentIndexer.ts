import { TextDocument } from 'vscode-languageserver-textdocument'
import { URI } from 'vscode-uri'
import { MatlabConnection } from '../lifecycle/MatlabCommunicationManager'
import MatlabLifecycleManager from '../lifecycle/MatlabLifecycleManager'
import FileInfoIndex, { MatlabCodeData, RawCodeData } from './FileInfoIndex'
import WorkspaceIndexer from './WorkspaceIndexer'

const INDEXING_DELAY = 500 // Delay (in ms) after keystroke before attempting to re-index the document

type IdentifierDefinitionResponse = IdentifierInfo | IdentifierInfo[]

interface IdentifierInfo {
    identifier: string
    fileInfo: {
        fileName: string
        line: number
        char: number
        codeData: RawCodeData
    }
}

/**
 * Handles indexing a currently open document to gather data about classes,
 * functions, and variables.
 */
class DocumentIndexer {
    private readonly INDEX_DOCUMENT_REQUEST_CHANNEL = '/matlabls/indexDocument/request'
    private readonly INDEX_DOCUMENT_RESPONSE_CHANNEL = '/matlabls/indexDocument/response'

    private readonly IDENTIFIER_DEFINITION_REQUEST_CHANNEL = '/matlabls/findIdentifierDefinition/request'
    private readonly IDENTIFIER_DEFINITION_RESPONSE_CHANNEL = '/matlabls/findIdentifierDefinition/response'

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

        const parsedCodeData = FileInfoIndex.parseAndStoreCodeData(textDocument.uri, rawCodeData)

        this.indexAdditionalClassData(parsedCodeData, matlabConnection, textDocument.uri)
    }

    /**
     * Indexes any supplemental files if the parsed code data represents a class.
     * This will index any other files in a @ directory, as well as any direct base classes.
     *
     * @param parsedCodeData The parsed code data
     * @param matlabConnection The connection to MATLAB
     * @param uri The document's URI
     */
    private indexAdditionalClassData (parsedCodeData: MatlabCodeData, matlabConnection: MatlabConnection, uri: string): void {
        if (parsedCodeData.classInfo == null) {
            return
        }

        // Queue indexing for other files in @ class directory
        const classDefFolder = parsedCodeData.classInfo.classDefFolder
        if (classDefFolder !== '') {
            WorkspaceIndexer.indexFolders([classDefFolder])
        }

        // Find and queue indexing for parent classes
        const baseClasses = parsedCodeData.classInfo.baseClasses
        if (baseClasses.length > 0) {
            const responseSub = matlabConnection.subscribe(this.IDENTIFIER_DEFINITION_RESPONSE_CHANNEL, message => {
                matlabConnection.unsubscribe(responseSub)

                const response = message as IdentifierDefinitionResponse
                const baseClassInfos: IdentifierInfo[] = Array.isArray(response) ? response : [response]

                baseClassInfos.forEach(baseClassInfo => {
                    const baseClassUri = URI.file(baseClassInfo.fileInfo.fileName).toString()
                    FileInfoIndex.parseAndStoreCodeData(baseClassUri, baseClassInfo.fileInfo.codeData)
                })
            })

            matlabConnection.publish(this.IDENTIFIER_DEFINITION_REQUEST_CHANNEL, {
                containingFile: URI.parse(uri).fsPath,
                identifiers: baseClasses
            })
        }
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
            const responseSub = matlabConnection.subscribe(this.INDEX_DOCUMENT_RESPONSE_CHANNEL, message => {
                matlabConnection.unsubscribe(responseSub)

                resolve(message as RawCodeData)
            })

            matlabConnection.publish(this.INDEX_DOCUMENT_REQUEST_CHANNEL, {
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
