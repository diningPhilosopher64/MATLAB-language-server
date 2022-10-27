import { ClientCapabilities, WorkspaceFolder, WorkspaceFoldersChangeEvent } from 'vscode-languageserver'
import { URI } from 'vscode-uri'
import ArgumentManager, { Argument } from '../lifecycle/ArgumentManager'
import MatlabLifecycleManager from '../lifecycle/MatlabLifecycleManager'
import { connection } from '../server'
import FileInfoIndex, { RawCodeData } from './FileInfoIndex'

interface WorkspaceFileIndexedResponse {
    isDone: boolean
    filePath: string
    codeData: RawCodeData
}

/**
 * Handles indexing files in the user's workspace to gather data about classes,
 * functions, and variables.
 */
class WorkspaceIndexer {
    private readonly REQUEST_CHANNEL = '/matlabls/indexWorkspace/request'
    private readonly RESPONSE_CHANNEL = '/matlabls/indexWorkspace/response/' // Needs to be appended with requestId

    private requestCt = 1

    private isWorkspaceIndexingSupported = false

    /**
     * Sets up workspace change listeners, if supported.
     *
     * @param capabilities The client capabilities, which contains information about
     * whether the client supports workspaces.
     */
    setupCallbacks (capabilities: ClientCapabilities): void {
        this.isWorkspaceIndexingSupported = capabilities.workspace?.workspaceFolders ?? false

        if (!this.isWorkspaceIndexingSupported) {
            // Workspace indexing not supported
            return
        }

        connection.workspace.onDidChangeWorkspaceFolders((params: WorkspaceFoldersChangeEvent) => {
            this.handleWorkspaceFoldersAdded(params.added)
        })
    }

    /**
     * Attempts to index the files in the user's workspace.
     */
    async indexWorkspace (): Promise<void> {
        if (!this.shouldIndexWorkspace()) {
            return
        }

        const folders = await connection.workspace.getWorkspaceFolders()

        if (folders == null) {
            return
        }

        this.indexFolders(folders.map(folder => folder.uri))
    }

    /**
     * Indexes the given list of workspace folders.
     *
     * @param folders A list of folder URIs to be indexed.
     */
    indexFolders (folders: string[]): void {
        const matlabConnection = MatlabLifecycleManager.getMatlabConnection()

        if (matlabConnection == null || !MatlabLifecycleManager.isMatlabReady()) {
            return
        }

        const requestId = this.requestCt++
        const responseSub = matlabConnection.subscribe(`${this.RESPONSE_CHANNEL}${requestId}`, msg => {
            const fileResults = msg as WorkspaceFileIndexedResponse

            if (fileResults.isDone) {
                // No more files being indexed - safe to unsubscribe
                matlabConnection.unsubscribe(responseSub)
            }

            // Convert file path to URI, which is used as an index when storing the code data
            const fileUri = URI.file(fileResults.filePath).toString()
            FileInfoIndex.parseAndStoreCodeData(fileUri, fileResults.codeData)
        })

        matlabConnection.publish(this.REQUEST_CHANNEL, {
            folders,
            requestId
        })
    }

    /**
     * Handles when new folders are added to the user's workspace by indexing them.
     *
     * @param folders The list of folders added to the workspace
     */
    private handleWorkspaceFoldersAdded (folders: WorkspaceFolder[]): void {
        if (!this.shouldIndexWorkspace()) {
            return
        }

        this.indexFolders(folders.map(folder => folder.uri))
    }

    /**
     * Determines whether or not the workspace should be indexed.
     * The workspace should be indexed if the client supports workspaces, and if the
     * workspace indexing setting is true.
     *
     * @returns True if workspace indexing should occurr, false otherwise.
     */
    private shouldIndexWorkspace (): boolean {
        return this.isWorkspaceIndexingSupported && ArgumentManager.getArgument(Argument.ShouldIndexWorkspace) as boolean
    }
}

export default new WorkspaceIndexer()
