// Copyright 2022 - 2023 The MathWorks, Inc.

import { ClientCapabilities, DidChangeConfigurationNotification, DidChangeConfigurationParams } from 'vscode-languageserver'
import { connection } from '../server'
import { getCliArgs } from '../utils/CliUtils'

export enum Argument {
    // Basic arguments
    MatlabLaunchCommandArguments = 'matlabLaunchCommandArgs',
    MatlabCertificateDirectory = 'matlabCertDir',
    MatlabInstallationPath = 'matlabInstallPath',
    MatlabConnectionTiming = 'matlabConnectionTiming',

    ShouldIndexWorkspace = 'indexWorkspace',

    // Advanced arguments
    MatlabUrl = 'matlabUrl'
}

export enum ConnectionTiming {
    Early = 'early',
    Late = 'late',
    Never = 'never'
}

interface CliArguments {
    [Argument.MatlabLaunchCommandArguments]: string
    [Argument.MatlabCertificateDirectory]: string
    [Argument.MatlabUrl]: string
}

interface Settings {
    installPath: string
    matlabConnectionTiming: ConnectionTiming
    indexWorkspace: boolean
}

class ConfigurationManager {
    private configuration: Settings | null = null
    private readonly defaultConfiguration: Settings
    private globalSettings: Settings

    // Holds additional command line arguments that are not part of the configuration
    private readonly additionalArguments: CliArguments

    private hasConfigurationCapability = false

    constructor () {
        const cliArgs = getCliArgs()

        this.defaultConfiguration = {
            installPath: '',
            matlabConnectionTiming: ConnectionTiming.Early,
            indexWorkspace: false
        }

        this.globalSettings = {
            installPath: cliArgs[Argument.MatlabInstallationPath] ?? this.defaultConfiguration.installPath,
            matlabConnectionTiming: cliArgs[Argument.MatlabConnectionTiming] as ConnectionTiming ?? this.defaultConfiguration.matlabConnectionTiming,
            indexWorkspace: cliArgs[Argument.ShouldIndexWorkspace] ?? this.defaultConfiguration.indexWorkspace
        }

        this.additionalArguments = {
            [Argument.MatlabLaunchCommandArguments]: cliArgs[Argument.MatlabLaunchCommandArguments] ?? '',
            [Argument.MatlabCertificateDirectory]: cliArgs[Argument.MatlabCertificateDirectory] ?? '',
            [Argument.MatlabUrl]: cliArgs[Argument.MatlabUrl] ?? ''
        }
    }

    /**
     * Sets up the configuration manager
     *
     * @param capabilities The client capabilities
     */
    setup (capabilities: ClientCapabilities): void {
        this.hasConfigurationCapability = capabilities.workspace?.configuration != null

        if (this.hasConfigurationCapability) {
            // Register for configuration changes
            void connection.client.register(DidChangeConfigurationNotification.type)
        }

        connection.onDidChangeConfiguration(params => this.handleConfigurationChanged(params))
    }

    /**
     * Gets the configuration for the langauge server
     *
     * @returns The current configuration
     */
    async getConfiguration (): Promise<Settings> {
        if (this.hasConfigurationCapability) {
            if (this.configuration == null) {
                this.configuration = await connection.workspace.getConfiguration('matlab') as Settings
            }

            return this.configuration
        }

        return this.globalSettings
    }

    /**
     * Gets the value of the given argument
     *
     * @param argument The argument
     * @returns The argument's value
     */
    getArgument (argument: Argument.MatlabLaunchCommandArguments | Argument.MatlabCertificateDirectory | Argument.MatlabUrl): string {
        return this.additionalArguments[argument]
    }

    /**
     * Handles a change in the configuration
     * @param params The configuration changed params
     */
    private handleConfigurationChanged (params: DidChangeConfigurationParams): void {
        if (this.hasConfigurationCapability) {
            // Clear cached configuration
            this.configuration = null
        } else {
            this.globalSettings = params.settings?.matlab ?? this.defaultConfiguration
        }
    }
}

export default new ConfigurationManager()
