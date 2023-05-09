// Copyright 2022 - 2023 The MathWorks, Inc.

import { ChildProcess, spawn } from 'child_process'
import { randomInt } from 'crypto'
import * as fs from 'fs/promises'
import * as net from 'net'
import * as os from 'os'
import * as path from 'path'

// Faye does not provide a @types package, so the older style
// `require` is needed.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Faye = require('faye')

type Client = typeof Faye.Client
type Subscription = typeof Faye.Client.Subscription

// Used to identify changes to the state of the connection with MATLAB®
export enum LifecycleEventType {
    CONNECTED,
    DISCONNECTED
}

interface MatlabProcessInfo {
    matlabProcess: ChildProcess
    matlabConnection: MatlabConnection
}

/**
 * Manages launching and communicating with MATLAB
 */
class MatlabCommunicationManager {
    /**
     * Launches and connects to MATLAB.
     *
     * @param launchCommand The command with which MATLAB is launched
     * @param launchArguments The arguments with which MATLAB is launched
     * @param logDirectory The directory in which MATLAB should log data
     * @param certificateDirectory The directory in which a certificate should be generated.
     * If no directory is provided, a temporary directory will be created.
     *
     * @returns Information about the new MATLAB process and the connection to it.
     * Returns null if the MATLAB process cannot be started.
     */
    async connectToNewMatlab (launchCommand: string, launchArguments: string[], logDirectory: string, certificateDirectory?: string): Promise<MatlabProcessInfo | null> {
        const certDir = certificateDirectory ?? await fs.mkdtemp(path.join(os.tmpdir(), 'matlablsTmp-'))
        const port = await this._getAvailablePort()
        const certFile = path.join(certDir, 'cert.pem')
        const pkeyFile = path.join(certDir, 'pkey.p12')
        const apiKey = this._makeApiKey()

        // Spawn new instance of MATLAB
        let matlabProcess
        try {
            matlabProcess = spawn(launchCommand, launchArguments, {
                cwd: process.env.HOME,
                env: {
                    ...process.env,
                    MATLAB_LOG_DIR: logDirectory,
                    MW_CONNECTOR_SECURE_PORT: port,
                    MW_CERTFILE: certFile,
                    MW_PKEYFILE: pkeyFile,
                    MWAPIKEY: apiKey
                }
            })
        } catch (e) {
            return null
        }

        // Clean up temp directory on close
        matlabProcess.on('close', () => {
            if (certificateDirectory == null) {
                // Only remove temp directory if we create it
                fs.rmdir(certDir)
            }
        })

        // Create connection to new MATLAB instance - connection will not yet be initialized
        const matlabConnection = new LocalMatlabConnection(port, certFile, pkeyFile, apiKey)

        return {
            matlabProcess,
            matlabConnection
        }
    }

    /**
     * Attempts to connect to an existing instance of MATLAB at the given URL.
     *
     * @param url The URL at which to find MATLAB
     * @returns The connection to MATLAB
     */
    async connectToExistingMatlab (url: string): Promise<MatlabConnection> {
        // Create connection to existing MATLAB instance - connection will not yet be initalized
        return new RemoteMatlabConnection(url)
    }

    /**
     * Gets a random available TCP port.
     *
     * @returns A random available TCP port, as a string
     */
    private async _getAvailablePort (): Promise<string> {
        return await new Promise<string>(resolve => {
            const srv = net.createServer()
            srv.unref()
            srv.listen(0, 'localhost', () => {
                const address = srv.address() as net.AddressInfo
                srv.close(() => {
                    resolve(address.port.toString())
                })
            })
        })
    }

    /**
     * Gets a random API key for MATLAB.
     *
     * @returns A random API key
     */
    private _makeApiKey (): string {
        const possibleChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~'
        const keyLength = 1024

        let apiKey = ''
        for (let i = 0; i < keyLength; i++) {
            apiKey += possibleChars.charAt(randomInt(possibleChars.length))
        }
        return apiKey
    }
}

type LifecycleListenerCallback = (eventType: LifecycleEventType) => void

/**
 * Abstract class representing a connection with the MATLAB application.
 */
export abstract class MatlabConnection {
    protected _client?: Client
    protected _url?: string
    protected _lifecycleCallback: LifecycleListenerCallback | null = null

    /**
     * Initializes the connection with MATLAB
     */
    abstract initialize (): Promise<void>

    /**
     * Closes the connection with MATLAB.
     * Does not attempt to close MATLAB.
     */
    close (): void {
        this._client?.disconnect()
        this._lifecycleCallback = null
    }

    /**
     * Publishes a message to the given channel.
     *
     * @param channel The channel to which the message is being published
     * @param message The message being published
     */
    publish (channel: string, message: unknown): void {
        this._client.publish(this._prependChannel(channel), message)
    }

    /**
     * Subscribe to messages published on the given channel. The messages will
     * be passed to hte given calback function.
     *
     * @param channel The channel for which to subscribe
     * @param callback The callback function
     * @returns The subscription object
     */
    subscribe (channel: string, callback: (message: unknown) => void): Subscription {
        return this._client.subscribe(this._prependChannel(channel), callback)
    }

    /**
     * Unsubscribe from the given subscription.
     *
     * @param subscription The subscription which is being unsubscribed
     */
    unsubscribe (subscription: Subscription): void {
        subscription.cancel()
    }

    /**
     * Sets a lifecycle listened callback. This will be called when there are
     * changes to the state of the connection with MATLAB.
     *
     * @param callback The callback function
     */
    setLifecycleListener (callback: LifecycleListenerCallback): void {
        this._lifecycleCallback = callback
    }

    protected onConnectionSuccess (): void {
        this._lifecycleCallback?.(LifecycleEventType.CONNECTED)
    }

    protected onConnectionFailure (): void {
        this._lifecycleCallback?.(LifecycleEventType.DISCONNECTED)
    }

    protected setupConnectionCallbacks (): void {
        this._client.on('transport:up', this.onConnectionSuccess.bind(this))
        this._client.on('transport:down', this.onConnectionFailure.bind(this))
    }

    /**
     * Prepends a channel name with '/matlab' as expected by MATLAB
     *
     * @param channel A channel name, in the format '/message/channel'
     * @returns A channel prepended with '/matlab', such as '/matlab/message/channel'
     */
    private _prependChannel (channel: string): string {
        return `/matlab${channel}`
    }
}

/**
 * Represents a connection to an instance of MATLAB on the local machine.
 */
class LocalMatlabConnection extends MatlabConnection {
    private readonly _certPath: string
    private readonly _pkeyPath: string
    private readonly _apiKey: string

    constructor (port: string, certPath: string, pkeyPath: string, apiKey: string) {
        super()
        this._url = `https://localhost:${port}/messageservice/async`
        this._certPath = certPath
        this._pkeyPath = pkeyPath
        this._apiKey = apiKey
    }

    async initialize (): Promise<void> {
        // Read certificate
        const ca = await fs.readFile(this._certPath)

        // Create connection
        this._client = new Faye.Client(this._url, { tls: { ca } })

        // Set API key as header
        this._client.setHeader('mwapikey', this._apiKey)

        // Set callbacks for the connection status
        this.setupConnectionCallbacks()

        // Cleanup cert and pkey files, as they are no longer needed
        fs.rm(this._certPath)
        fs.rm(this._pkeyPath)
    }
}

/**
 * Represents a connection to an instance of MATLAB on a remote machine.
 */
class RemoteMatlabConnection extends MatlabConnection {
    constructor (url: string) {
        super()
        this._url = url
    }

    async initialize (): Promise<void> {
        // For now, certificates will not be used for connecting to an existing instance of
        // MATLAB. Instead, the URL will provide all necessary information.

        // Create connection
        this._client = new Faye.Client(this._url)

        // Set callbacks for the connection status
        this.setupConnectionCallbacks()

        // Publish dummy message to kickstart connection. This will cause the success/failure
        // callbacks above to be called.
        this.publish('matlabls/connection/startup', {})
    }
}

export default new MatlabCommunicationManager()