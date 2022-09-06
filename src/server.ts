import { TextDocument } from 'vscode-languageserver-textdocument'
import { createConnection, InitializeResult, ProposedFeatures, TextDocuments } from 'vscode-languageserver/node'
import ArgumentManager, { Argument } from './lifecycle/ArgumentManager'
import MatlabLifecycleManager, { ConnectionTiming } from './lifecycle/MatlabLifecycleManager'
import Logger from './logging/Logger'
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
        // TODO: Handle things after MATLAB has launched
    }
})

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

// Start listening to open/change/close text document events
documentManager.listen(connection)
