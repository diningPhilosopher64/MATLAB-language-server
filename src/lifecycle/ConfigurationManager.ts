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
    matlab: MatlabSettings
    editor: EditorSettings
}

interface MatlabSettings {
    installPath: string
    matlabConnectionTiming: ConnectionTiming
    indexWorkspace: boolean
}

interface EditorSettings {
    insertSpaces: boolean
    tabSize: number
    indentSize: 'tabSize' | number
}

class ConfigurationManager {
    private readonly defaultConfiguration: Settings

    private readonly configurationMap: Map<string, Settings> = new Map()
    private globalSettings: Settings

    // Holds additional command line arguments that are not part of the configuration
    private readonly additionalArguments: CliArguments

    private hasConfigurationCapability = false

    constructor () {
        const cliArgs = getCliArgs()

        this.defaultConfiguration = {
            matlab: {
                installPath: '',
                matlabConnectionTiming: ConnectionTiming.Early,
                indexWorkspace: false
            },
            editor: {
                insertSpaces: true,
                tabSize: 4,
                indentSize: 'tabSize'
            }
        }

        this.globalSettings = {
            matlab: {
                installPath: cliArgs[Argument.MatlabInstallationPath] ?? this.defaultConfiguration.matlab.installPath,
                matlabConnectionTiming: cliArgs[Argument.MatlabConnectionTiming] as ConnectionTiming ?? this.defaultConfiguration.matlab.matlabConnectionTiming,
                indexWorkspace: cliArgs[Argument.ShouldIndexWorkspace] ?? this.defaultConfiguration.matlab.indexWorkspace
            },
            editor: this.defaultConfiguration.editor
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
     * @param resource The document URI for which we are scoping the configuration.
     * If none is provided, a default (non-scoped) configuration is provided
     */
    async getConfiguration (resource?: string): Promise<Settings> {
        if (this.hasConfigurationCapability) {
            let result = this.configurationMap.get(resource ?? 'default')
            if (result == null) {
                // No cached configuration for this resource - retrieve and cache
                const configs = await connection.workspace.getConfiguration([
                    { scopeUri: resource, section: 'matlab' },
                    { scopeUri: resource, section: 'editor' }
                ]) as [MatlabSettings, EditorSettings]

                result = {
                    matlab: configs[0],
                    editor: configs[1]
                }

                this.configurationMap.set(resource ?? 'default', result)
            }

            return result
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
            // Clear cached configurations
            this.configurationMap.clear()
        } else {
            this.globalSettings = {
                matlab: params.settings?.matlab ?? this.defaultConfiguration.matlab,
                editor: params.settings?.editor ?? this.defaultConfiguration.editor
            }
        }
    }
}

export default new ConfigurationManager()
