// Copyright 2022 - 2023 The MathWorks, Inc.

import { ChildProcess } from 'child_process'
import { _Connection } from 'vscode-languageserver'

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import MatlabCommunicationManager, { LifecycleEventType, MatlabConnection } from './MatlabCommunicationManager'
import Logger from '../logging/Logger'
import ConfigurationManager, { Argument } from './ConfigurationManager'
import { connection } from '../server'
import LifecycleNotificationHelper from './LifecycleNotificationHelper'
import NotificationService, { Notification } from '../notifications/NotificationService'
import { Actions, reportTelemetryAction } from '../logging/TelemetryUtils'

export enum ConnectionTiming {
    Early = 'early',
    Late = 'late',
    Never = 'never'
}

enum ConnectionState {
    CONNECTING = 'connecting',
    CONNECTED = 'connected',
    DISCONNECTED = 'disconnected'
}

interface MatlabLifecycleEvent {
    matlabStatus: 'connected' | 'disconnected'
}

export interface MatlabConnectionStatusParam {
    connectionAction: 'connect' | 'disconnect'
}

type MatlabLifecycleCallback = (error: Error | null, evt: MatlabLifecycleEvent) => void

/**
 * Manages the lifecycle of the connected MATLAB® application.
 */
class MatlabLifecycleManager {
    private _matlabProcess: MatlabProcess | null = null
    private readonly _matlabLifecycleCallbacks: MatlabLifecycleCallback[] = []

    /**
     * Connects to MATLAB.
     *
     * @param connection The language server connection
     * @returns The MATLAB process
     */
    async connectToMatlab (connection: _Connection): Promise<MatlabProcess> {
        if (this._shouldConnectToExistingMatlab()) {
            return await this._connectToExistingMatlab(connection)
        } else {
            return await this._launchAndConnectToMatlab(connection)
        }
    }

    /**
     * Disconnects from MATLAB.
     */
    disconnectFromMatlab (): void {
        if (this._matlabProcess == null || !this._matlabProcess.isValid) {
            return
        }

        this._matlabProcess?.shutdown()
        this._matlabProcess = null

        this._handleMatlabLifecycleUpdate('disconnected')
    }

    /**
     * Gets whether or not MATLAB is ready for communication.
     *
     * @returns Whether or not MATLAB can be communicated with.
     */
    isMatlabReady (): boolean {
        return Boolean(this._matlabProcess?.isMatlabReady())
    }

    /**
     * Gets the active connection to MATLAB. Does not attempt to create a connection if
     * one does not currently exist.
     *
     * @returns The connection to MATLAB, or null if there is no active connection.
     */
    getMatlabConnection (): MatlabConnection | null {
        const isMatlabValid = this._matlabProcess?.isValid ?? false
        if (isMatlabValid) {
            return this._matlabProcess?.getConnection() ?? null
        }

        return null
    }

    /**
     * Gets the active connection to MATLAB. If one does not currently exist, this will
     * attempt to establish a connection.
     *
     * @param connection The language server connection
     * @returns The connection to MATLAB, or null if one cannot be established.
     */
    async getOrCreateMatlabConnection (connection: _Connection): Promise<MatlabConnection | null> {
        // Check if there is already an active connection
        const activeConnection = this.getMatlabConnection()
        if (activeConnection != null) {
            return activeConnection
        }

        // No active connection - should create a connection if desired
        const connectionTiming = (await ConfigurationManager.getConfiguration()).matlabConnectionTiming
        if (connectionTiming !== ConnectionTiming.Never) {
            const matlabProcess = await this.connectToMatlab(connection)
            return matlabProcess.getConnection()
        }

        // No connection should be created
        return null
    }

    /**
     * Adds a callback for MATLAB lifecycle events, such as when a connection is
     * established or broken.
     *
     * @param callback The callback function
     */
    addMatlabLifecycleListener (callback: MatlabLifecycleCallback): void {
        this._matlabLifecycleCallbacks.push(callback)
    }

    /**
     * Handles requests from the language client to either connect to or disconnect from MATLAB
     *
     * @param data Data about whether or not MATLAB should be connected or disconnected
     */
    handleConnectionStatusChange (data: MatlabConnectionStatusParam): void {
        if (data.connectionAction === 'connect') {
            void this.connectToMatlab(connection)
        } else {
            this.disconnectFromMatlab()
        }
    }

    /**
     * Whether or not the language server should attempt to connect to an existing
     * MATLAB instance.
     *
     * @returns True if the language server should attempt to connect to an
     * already-running instance of MATLAB. False otherwise.
     */
    private _shouldConnectToExistingMatlab (): boolean {
        // Assume we should connect to existing MATLAB if the matlabUrl startup flag has been provided
        return Boolean(ConfigurationManager.getArgument(Argument.MatlabUrl))
    }

    /**
     * Attempts to connect to an existing MATLAB process.
     *
     * @param connection The language server connection
     * @returns The connected MATLAB process
     */
    private async _connectToExistingMatlab (connection: _Connection): Promise<MatlabProcess> {
        const url = ConfigurationManager.getArgument(Argument.MatlabUrl)

        if (this._matlabProcess == null || !this._matlabProcess.isValid) {
            this._matlabProcess = new MatlabProcess(connection)
        }

        await this._matlabProcess.connectToMatlab(url)
        return this._matlabProcess
    }

    /**
     * Attempts to launch and then connect to MATLAB.
     *
     * @param connection The language server connection
     * @returns The connected MATLAB process
     */
    private async _launchAndConnectToMatlab (connection: _Connection): Promise<MatlabProcess> {
        if (this._matlabProcess == null || !this._matlabProcess.isValid) {
            this._matlabProcess = new MatlabProcess(connection)
        }

        if (!this._matlabProcess.isMatlabReady()) {
            await this._matlabProcess.launchMatlab()
            this._handleMatlabLifecycleUpdate('connected')
        }

        return this._matlabProcess
    }

    /**
     * Emits a lifecycle update to all listeners.
     *
     * @param status The connected status of MATLAB
     */
    private _handleMatlabLifecycleUpdate (status: 'connected' | 'disconnected'): void {
        this._matlabLifecycleCallbacks.forEach(callback => {
            callback(null, {
                matlabStatus: status
            })
        })
    }
}

/**
 * Represents a MATLAB process
 */
class MatlabProcess {
    private _matlabProcess?: ChildProcess
    private _matlabConnection: MatlabConnection | null = null
    private _matlabPid = 0
    private _isReady = false // Whether MATLAB is ready for communication

    isValid = true // Gets set to false when the process is terminated
    isExistingInstance = false

    constructor (private readonly _connection: _Connection) {}

    /**
     * Gets the connection to MATLAB, if one exists.
     *
     * @returns The MATLAB connection, or null if none exists
     */
    getConnection (): MatlabConnection | null {
        return this._matlabConnection
    }

    /**
     Gets whether or not MATLAB is ready for communication
     * @returns True if MATLAB can be communicated with, false otherwise
     */
    isMatlabReady (): boolean {
        return this.isValid && this._isReady
    }

    /**
     * Shuts down the MATLAB process
     */
    shutdown (): void {
        if (!this.isValid) {
            return
        }

        if (this.isExistingInstance) {
            // Only want to close the connection
            this._matlabConnection?.close()
        } else {
            // Close connection and kill MATLAB process
            if (os.platform() === 'win32' && this._matlabPid > 0) {
                // Need to kill the child process which is launched on Windows
                process.kill(this._matlabPid)
            }
            this._matlabConnection?.close()
            this._matlabProcess?.kill()
        }

        this.isValid = false
        LifecycleNotificationHelper.notifyConnectionStatusChange(ConnectionState.DISCONNECTED)
        reportTelemetryAction(Actions.ShutdownMatlab)
    }

    /**
     * Attempts to launch a new instance of MATLAB
     */
    async launchMatlab (): Promise<void> {
        LifecycleNotificationHelper.didMatlabLaunchFail = false
        LifecycleNotificationHelper.notifyConnectionStatusChange(ConnectionState.CONNECTING)

        return await new Promise<void>(resolve => {
            const outFile = path.join(Logger.logDir, 'matlabls_conn.json')
            if (!fs.existsSync(outFile)) {
                fs.writeFileSync(outFile, '', { mode: '600' })
            }

            fs.watchFile(outFile, () => {
                // TODO: Do we need to ensure the file has finished being written by MATLAB?

                Logger.log('Started MATLAB')

                this._isReady = true

                const data = fs.readFileSync(outFile)
                const info = JSON.parse(data.toString())

                this._matlabPid = info.matlabPid
                const matlabRelease = info.matlabRelease as string // e.g. R2023a

                this._matlabConnection?.initialize().then(() => {
                    fs.unwatchFile(outFile)
                    LifecycleNotificationHelper.notifyConnectionStatusChange(ConnectionState.CONNECTED)
                    reportTelemetryAction(Actions.StartMatlab, matlabRelease)
                    resolve()
                }).catch(() => {
                    Logger.error('Failed to connect to MATLAB')
                    reportTelemetryAction(Actions.StartMatlab, 'Failed to connect to MATLAB')
                })
            })

            void this._launchMatlabProcess(outFile)
        })
    }

    /**
     * Attempts to connect to an existing instance of MATLAB at the given URL.
     *
     * @param url The URL at which to find MATLAB
     */
    async connectToMatlab (url: string): Promise<void> {
        LifecycleNotificationHelper.notifyConnectionStatusChange(ConnectionState.CONNECTING)

        this._matlabConnection = await MatlabCommunicationManager.connectToExistingMatlab(url)

        this._matlabConnection.setLifecycleListener(lifecycleEvent => {
            if (lifecycleEvent === LifecycleEventType.CONNECTED) {
                this._isReady = true
                LifecycleNotificationHelper.notifyConnectionStatusChange(ConnectionState.CONNECTED)
            } else if (lifecycleEvent === LifecycleEventType.DISCONNECTED) {
                // Connection failed - retry after delay
                this._matlabConnection?.close()
                this._matlabConnection = null
                this._isReady = false
                LifecycleNotificationHelper.notifyConnectionStatusChange(ConnectionState.DISCONNECTED)
                setTimeout(() => {
                    void this.connectToMatlab(url)
                }, 1000)
            }
        })

        await this._matlabConnection.initialize()
    }

    /**
     * Launches a MATLAB process.
     *
     * @param outFile The file in which MATLAB should output connection details
     */
    private async _launchMatlabProcess (outFile: string): Promise<void> {
        const { command, args } = await this._getMatlabLaunchCommand(outFile)

        Logger.log('Launching MATLAB...')

        const { matlabProcess, matlabConnection } = await MatlabCommunicationManager.connectToNewMatlab(command, args, ConfigurationManager.getArgument(Argument.MatlabCertificateDirectory))

        this._matlabProcess = matlabProcess
        this._matlabConnection = matlabConnection

        // Handle errors from MATLAB's standard err
        this._matlabProcess.stderr?.on('data', data => {
            const stderrStr: string = data.toString().trim()
            if (stderrStr.startsWith('MEMORY MANAGEMENT')) { return }

            const msg = `MATLAB command stderr: ${stderrStr}`
            Logger.log(msg)
            this._connection.window.showErrorMessage(msg)
        })

        /**
         * Handles the MATLAB process being terminated unexpectedly.
         * This could include the user killing the process.
         */
        this._matlabProcess.on('close', () => {
            // Close connection
            Logger.log('MATLAB process terminated')
            this._matlabConnection?.close()
            this.isValid = false

            LifecycleNotificationHelper.notifyConnectionStatusChange(ConnectionState.DISCONNECTED)
        })

        // Handles errors with the MATLAB process
        this._matlabProcess.on('error', error => {
            Logger.error(`Error launching MATLAB: ${error.message}`)
            Logger.error(`Error launching MATLAB: ${error.name}`)
            if (error.stack != null) {
                Logger.error(`Error launching MATLAB: ${error.stack}`)
            }

            LifecycleNotificationHelper.didMatlabLaunchFail = true
            NotificationService.sendNotification(Notification.MatlabLaunchFailed)
        })

        this._matlabConnection.setLifecycleListener(lifecycleEvent => {
            if (lifecycleEvent === LifecycleEventType.DISCONNECTED) {
                Logger.warn('Error while communicating with MATLAB - disconnecting')
                this._matlabConnection?.close()
                this.isValid = false

                LifecycleNotificationHelper.notifyConnectionStatusChange(ConnectionState.DISCONNECTED)
                reportTelemetryAction(Actions.ShutdownMatlab, 'Error while communicating with MATLAB')
            }
        })
    }

    /**
     * Gets the command with which MATLAB should be launched.
     *
     * @param outFile The file in which MATLAB should output connection details
     * @returns The matlab launch command
     */
    private async _getMatlabLaunchCommand (outFile: string): Promise<{ command: string, args: string[] }> {
        const matlabInstallPath = (await ConfigurationManager.getConfiguration()).installPath
        let command = 'matlab'
        if (matlabInstallPath !== '') {
            command = path.normalize(path.join(
                matlabInstallPath,
                'bin',
                'matlab'
            ))
        }

        const args = [
            '-log',
            '-logfile', path.join(Logger.logDir, 'matlabls.log'), // Log file
            '-memmgr', 'release', // Memory manager
            '-noAppIcon', // Hide MATLAB application icon in taskbar/dock, if applicable
            '-nosplash', // Hide splash screen
            '-r', `addpath(fullfile('${__dirname}', '..', 'matlab')); initmatlabls('${outFile}')`, // Startup command
            '-useStartupFolderPref' // Startup folder flag
        ]

        if (os.platform() === 'win32') {
            args.push('-noDisplayDesktop') // Workaround for '-nodesktop' on Windows until a better solution is implemented
            args.push('-wait')
        } else {
            args.push('-nodesktop')
        }

        const argsFromSettings = ConfigurationManager.getArgument(Argument.MatlabLaunchCommandArguments) ?? null
        if (argsFromSettings != null) {
            args.push(argsFromSettings)
        }

        return {
            command,
            args
        }
    }
}

export default new MatlabLifecycleManager()
