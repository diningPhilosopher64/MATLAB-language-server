// Copyright 2022 - 2024 The MathWorks, Inc.

import { ClientCapabilities, DidChangeConfigurationNotification, DidChangeConfigurationParams, Disposable } from 'vscode-languageserver'
import { reportTelemetrySettingsChange } from '../logging/TelemetryUtils'
import { connection } from '../server'
import { getCliArgs } from '../utils/CliUtils'
import NotificationService, { Notification } from '../notifications/NotificationService'
import Licensing from '../licensing'

export enum Argument {
    // Basic arguments
    MatlabLaunchCommandArguments = 'matlabLaunchCommandArgs',
    MatlabInstallationPath = 'matlabInstallPath',
    MatlabConnectionTiming = 'matlabConnectionTiming',

    ShouldIndexWorkspace = 'indexWorkspace',

    // Advanced arguments
    MatlabUrl = 'matlabUrl'
}

export enum ConnectionTiming {
    OnStart = 'onStart',
    OnDemand = 'onDemand',
    Never = 'never'
}

interface CliArguments {
    [Argument.MatlabLaunchCommandArguments]: string
    [Argument.MatlabUrl]: string
}

export interface Settings {
    installPath: string
    matlabConnectionTiming: ConnectionTiming
    indexWorkspace: boolean
    telemetry: boolean
    triggerLicensingWorkflows: boolean
}

type SettingName = 'installPath' | 'matlabConnectionTiming' | 'indexWorkspace' | 'telemetry' | 'triggerLicensingWorkflows'

const SETTING_NAMES: SettingName[] = [
    'installPath',
    'matlabConnectionTiming',
    'indexWorkspace',
    'telemetry',
    'triggerLicensingWorkflows'
]

class ConfigurationManager {
    private configuration: Settings | null = null
    private readonly defaultConfiguration: Settings
    private globalSettings: Settings

    // Holds additional command line arguments that are not part of the configuration
    private readonly additionalArguments: CliArguments

    private hasConfigurationCapability = false

    // Map to keep track of callbacks to execute when a specific setting changes
    private settingChangeCallbacks: Map<SettingName, (configuration: Settings) => void> = new Map();

    constructor () {
        const cliArgs = getCliArgs()

        this.defaultConfiguration = {
            installPath: '',
            matlabConnectionTiming: ConnectionTiming.OnStart,
            indexWorkspace: false,
            telemetry: true,
            triggerLicensingWorkflows: false
        }

        this.globalSettings = {
            installPath: cliArgs[Argument.MatlabInstallationPath] ?? this.defaultConfiguration.installPath,
            matlabConnectionTiming: cliArgs[Argument.MatlabConnectionTiming] as ConnectionTiming ?? this.defaultConfiguration.matlabConnectionTiming,
            indexWorkspace: cliArgs[Argument.ShouldIndexWorkspace] ?? this.defaultConfiguration.indexWorkspace,
            telemetry: this.defaultConfiguration.telemetry,
            triggerLicensingWorkflows: this.defaultConfiguration.triggerLicensingWorkflows
        }

        this.additionalArguments = {
            [Argument.MatlabLaunchCommandArguments]: cliArgs[Argument.MatlabLaunchCommandArguments] ?? '',
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

        connection.onDidChangeConfiguration(params => { void this.handleConfigurationChanged(params) })
    }
    
    /**
     * Registers a callback for setting changes.
     * 
     * @param {SettingName} settingName - The setting to listen for.
     * @param {(configuration: Settings) => void | Promise<void>} onSettingChangeCallback - The callback invoked on setting change.
     * @returns {Promise<void>} Resolves when the callback is registered.
     * @throws {Error} For invalid setting names.
     */
    async addSettingCallback(settingName: SettingName, onSettingChangeCallback: (configuration: Settings) => void | Promise<void>): Promise<void> {
        if(!this.settingChangeCallbacks.get(settingName)){
            this.settingChangeCallbacks.set(settingName, onSettingChangeCallback)
        }
    
        const configuration = await this.getConfiguration()

        await onSettingChangeCallback(configuration)        
     }

    /**
     * Gets the configuration for the langauge server
     *
     * @returns The current configuration
     */
    async getConfiguration (): Promise<Settings> {
        if (this.hasConfigurationCapability) {
            if (this.configuration == null) {
                this.configuration = await connection.workspace.getConfiguration('MATLAB') as Settings
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
    getArgument (argument: Argument.MatlabLaunchCommandArguments | Argument.MatlabUrl): string {
        return this.additionalArguments[argument]
    }

    /**
     * Handles a change in the configuration
     * @param params The configuration changed params
     */
    private async handleConfigurationChanged (params: DidChangeConfigurationParams): Promise<void> {
        let oldConfig: Settings | null
        let newConfig: Settings

        if (this.hasConfigurationCapability) {
            oldConfig = this.configuration

            // Clear cached configuration
            this.configuration = null

            // Force load new configuration
            newConfig = await this.getConfiguration()           
        } else {
            oldConfig = this.globalSettings
            this.globalSettings = params.settings?.matlab ?? this.defaultConfiguration

            newConfig = this.globalSettings
        }

        this.compareSettingChanges(oldConfig, newConfig)
    }

    private compareSettingChanges (oldConfiguration: Settings | null, newConfiguration: Settings): void {
        if (oldConfiguration == null) {
            // Not yet initialized
            return
        }

        for (let i = 0; i < SETTING_NAMES.length; i++) {
            const settingName = SETTING_NAMES[i]
            const oldValue = oldConfiguration[settingName]
            const newValue = newConfiguration[settingName]

            if (oldValue !== newValue) {
                reportTelemetrySettingsChange(settingName, newValue.toString(), oldValue.toString())

                // As the setting changed, execute the corresponding callback for it.
                let callback = this.settingChangeCallbacks.get(settingName);
                if(callback){
                    callback(newConfiguration)
                }
            }
        }
    }
}

export default new ConfigurationManager()
