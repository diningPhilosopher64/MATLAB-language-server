// Copyright 2022 - 2024 The MathWorks, Inc.

import { Disposable, GenericNotificationHandler } from 'vscode-languageserver'
import { connection } from '../server'

export enum Notification {
    // Connection Status Updates
    MatlabConnectionClientUpdate = 'matlab/connection/update/client',
    MatlabConnectionServerUpdate = 'matlab/connection/update/server',

    // Execution
    MatlabRequestInstance = 'matlab/request',

    MVMEvalRequest = 'evalRequest',
    MVMEvalComplete = 'evalRequest',
    MVMFevalRequest = 'fevalRequest',
    MVMFevalComplete = 'fevalRequest',

    MVMText = 'text',
    MVMClc = 'clc',

    MVMInterruptRequest = 'interruptRequest',

    MVMStateChange = 'mvmStateChange',

    // Errors
    MatlabLaunchFailed = 'matlab/launchfailed',
    MatlabFeatureUnavailable = 'feature/needsmatlab',
    MatlabFeatureUnavailableNoMatlab = 'feature/needsmatlab/nomatlab',

    // Telemetry
    LogTelemetryData = 'telemetry/logdata',

    // Licensing
    LicensingServerUrl = 'licensing/server/url',
    LicensingData = 'licensing/data',
    LicensingDelete = 'licensing/delete',
    LicensingError = 'licensing/error',
}

class NotificationService {
    /**
     * Sends a notification to the language client
     *
     * @param name The name of the notification
     * @param params Any parameters to send with the notification
     */
    sendNotification (name: string, params?: unknown): void {
        void connection.sendNotification(name, params)
    }

    /**
     * Sets up a listener for notifications from the language client
     *
     * @param name The name of the notification
     * @param callback The callback
     */
    registerNotificationListener (name: string, callback: GenericNotificationHandler): void {
        connection.onNotification(name, callback)
    }

    /**
     * Sets up a listener for notifications from the language client
     *
     * @param name The name of the notification
     * @param callback The callback
     * @returns {Disposable} A disposable object that can be used to dispose/unregister the listener.
     */
    registerDisposableNotificationListener(name: string, callback: GenericNotificationHandler ): Disposable {
        return connection.onNotification(name, callback)
    }
}

export default new NotificationService()
