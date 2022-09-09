import { TextDocument } from 'vscode-languageserver-textdocument'
import { createConnection, InitializeResult, ProposedFeatures, TextDocuments } from 'vscode-languageserver/node'
import ArgumentManager, { Argument } from './lifecycle/ArgumentManager'
import MatlabLifecycleManager, { ConnectionTiming } from './lifecycle/MatlabLifecycleManager'
import Logger from './logging/Logger'
import FormatSupportProvider from './providers/formatting/FormatSupportProvider'
import LintingSupportProvider from './providers/linting/LintingSupportProvider'
import ExecuteCommandProvider, { MatlabLSCommands } from './providers/lspCommands/ExecuteCommandProvider'
import { getCliArgs } from './utils/CliUtils'

// Create a connection for the server
export const connection = createConnection(ProposedFeatures.all)

// Initialize Logger
Logger.initialize(connection.console)

// Create basic text document manager
const documentManager: TextDocuments<TextDocument> = new TextDocuments(TextDocument)

// Get CLI arguments
const cliArgs = getCliArgs()
ArgumentManager.initializeFromCliArguments(cliArgs)

MatlabLifecycleManager.addMatlabLifecycleListener((error, lifecycleEvent) => {
    if (error != null) {
        Logger.error(`MATLAB Lifecycle Error: ${error.message}\n${error.stack ?? ''}`)
    }

    if (lifecycleEvent.matlabStatus === 'connected') {
        // Handle things after MATLAB has launched
        documentManager.all().forEach(textDocument => {
            void LintingSupportProvider.lintDocument(textDocument, connection)
        })
    }
})

// Handles an initialization request
connection.onInitialize(() => {
    // Defines the capabilities supported by this language server
    const initResult: InitializeResult = {
        capabilities: {
            codeActionProvider: true,
            documentFormattingProvider: true,
            executeCommandProvider: {
                commands: Object.values(MatlabLSCommands)
            }
        }
    }

    return initResult
})

// Handles the initialized notification
connection.onInitialized(() => {
    // Launch MATLAB if it should be launched early
    if (ArgumentManager.getArgument(Argument.MatlabConnectionTiming) === ConnectionTiming.Early) {
        void MatlabLifecycleManager.connectToMatlab(connection)
    }
})

// Handles a shutdown request
connection.onShutdown(() => {
    // Shut down MATLAB
    MatlabLifecycleManager.disconnectFromMatlab()
})

// Set up connection notification listeners
connection.onNotification('matlab/updateConnection', (data: { connectionAction: 'connect' | 'disconnect' }) => {
    if (data.connectionAction === 'connect') {
        void MatlabLifecycleManager.connectToMatlab(connection)
    } else if (data.connectionAction === 'disconnect') {
        MatlabLifecycleManager.disconnectFromMatlab()
    }
})

// Handles files opened
documentManager.onDidOpen(params => {
    void LintingSupportProvider.lintDocument(params.document, connection)
})

// Handles files saved
documentManager.onDidSave(params => {
    void LintingSupportProvider.lintDocument(params.document, connection)
})

// Handles changes to the text document
documentManager.onDidChangeContent(params => {
    if (MatlabLifecycleManager.isMatlabReady()) {
        // Only want to lint on content changes when linting is being backed by MATLAB
        LintingSupportProvider.queueLintingForDocument(params.document, connection)
    }
})

// Handle execute command requests
connection.onExecuteCommand(params => {
    void ExecuteCommandProvider.handleExecuteCommand(params, documentManager, connection)
})

/** -------------------- FORMATTING SUPPORT -------------------- **/
connection.onDocumentFormatting(async params => {
    return await FormatSupportProvider.handleDocumentFormatRequest(params, documentManager, connection)
})

/** --------------------  LINTING SUPPORT   -------------------- **/
connection.onCodeAction(params => {
    return LintingSupportProvider.handleCodeActionRequest(params)
})

// Start listening to open/change/close text document events
documentManager.listen(connection)
