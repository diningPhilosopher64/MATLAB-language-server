/// <reference types="node" />
import { ChildProcess } from 'child_process';
declare const Faye: any;
declare type Client = typeof Faye.Client;
declare type Subscription = typeof Faye.Client.Subscription;
export declare enum LifecycleEventType {
    CONNECTED = 0,
    DISCONNECTED = 1
}
interface MatlabProcessInfo {
    matlabProcess: ChildProcess;
    matlabConnection: MatlabConnection;
}
/**
 * Manages launching and communicating with MATLAB
 */
declare class MatlabCommunicationManager {
    /**
     * Launches and connects to MATLAB.
     *
     * @param launchCommand The command with which MATLAB is launched
     * @param launchArguments The arguments with which MATLAB is launched
     * @param logDirectory The directory in which MATLAB should log data
     *
     * @returns Information about the new MATLAB process and the connection to it.
     * Returns null if the MATLAB process cannot be started.
     */
    connectToNewMatlab(launchCommand: string, launchArguments: string[], logDirectory: string): Promise<MatlabProcessInfo | null>;
    /**
     * Attempts to connect to an existing instance of MATLAB at the given URL.
     *
     * @param url The URL at which to find MATLAB
     * @returns The connection to MATLAB
     */
    connectToExistingMatlab(url: string): Promise<MatlabConnection>;
    /**
     * Gets a random available TCP port.
     *
     * @returns A random available TCP port, as a string
     */
    private _getAvailablePort;
    /**
     * Gets a random API key for MATLAB.
     *
     * @returns A random API key
     */
    private _makeApiKey;
}
declare type MessageData = {
    [key: string]: unknown;
};
declare type LifecycleListenerCallback = (eventType: LifecycleEventType) => void;
/**
 * Abstract class representing a connection with the MATLAB application.
 */
export declare abstract class MatlabConnection {
    protected _client?: Client;
    protected _url?: string;
    protected _lifecycleCallback: LifecycleListenerCallback | null;
    protected _channelIdCt: number;
    /**
     * Initializes the connection with MATLAB
     */
    abstract initialize(): Promise<void>;
    /**
     * Closes the connection with MATLAB.
     * Does not attempt to close MATLAB.
     */
    close(): void;
    /**
     * Gets a unique channel ID which can be provided to `publish` and `subscribe`.
     *
     * @returns A unique channel ID
     */
    getChannelId(): string;
    /**
     * Publishes data to the given channel.
     *
     * If provided, the channel ID is included with the data as a `channelId_` property.
     *
     * @param channel The channel to which the message is being published
     * @param data The data being published
     * @param channelId An optional indentifier
     */
    publish(channel: string, data: MessageData, channelId?: string): void;
    /**
     * Subscribe to data published on the given channel. The data will
     * be passed to the given calback function.
     *
     * If a channelId is provided, it will be appended to the channel to
     * create a unique channel.
     *
     * @param channel The channel for which to subscribe
     * @param callback The callback function
     * @returns The subscription object
     */
    subscribe(channel: string, callback: (data: unknown) => void, channelId?: string): Subscription;
    /**
     * Unsubscribe from the given subscription.
     *
     * @param subscription The subscription which is being unsubscribed
     */
    unsubscribe(subscription: Subscription): void;
    /**
     * Sets a lifecycle listened callback. This will be called when there are
     * changes to the state of the connection with MATLAB.
     *
     * @param callback The callback function
     */
    setLifecycleListener(callback: LifecycleListenerCallback): void;
    protected onConnectionSuccess(): void;
    protected onConnectionFailure(): void;
    protected setupConnectionCallbacks(): void;
}
declare const _default: MatlabCommunicationManager;
export default _default;
