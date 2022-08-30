import { TextDocument } from 'vscode-languageserver-textdocument'
import { createConnection, InitializeResult, ProposedFeatures, TextDocuments } from 'vscode-languageserver/node'
import Logger from './logging/Logger'

// Create a connection for the server
export const connection = createConnection(ProposedFeatures.all)

// Initialize Logger
Logger.initialize(connection.console)

// Create basic text document manager
const documentManager: TextDocuments<TextDocument> = new TextDocuments(TextDocument)
documentManager.listen(connection) // Listen to open/change/close text document events

// Handles an initialization request
connection.onInitialize(() => {
    // Defines the capabilities supported by this language server
    const initResult: InitializeResult = {
        capabilities: {
            // Will be populated as features are added
        }
    }

    return initResult
})

// Handles the initialized notification
connection.onInitialized(() => {
    // TODO: To be filled in
})

// Handles a shutdown request
connection.onShutdown(() => {
    // TODO: To be filled in
})
