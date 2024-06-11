// Copyright 2024 The MathWorks, Inc.

import { AppError } from '../licensing/errors';
import { Entitlement, MHLMLicenseType, NLMLicenseType, LicensingData, ExistingLicenseType } from '../licensing/types';
import { Disposable } from 'vscode-languageserver';
import Licensing from '../licensing';
import { setInstallPath } from '../licensing/config'
import NotificationService, { Notification } from '../notifications/NotificationService';
import { Settings } from '../lifecycle/ConfigurationManager';
import Logger from '../logging/Logger';

import {startServer} from '../licensing/server'
import { staticFolderPath } from '../licensing/config';
import { sleep } from './TimeUtils';

/**
 * Recursively finds all occurrences of the "entitlement" key in the given object and its nested objects.
 * 
 * @param {any} obj - The object to search.
 * @returns {Entitlement[][]} An array of arrays containing the entitlement values found.
 */
export function findAllEntitlements(obj: any): Entitlement[][] {
    let result: Entitlement[][] = [];
    const keyToFind = "entitlement"

    function recursiveSearch(obj: any) {
        if (!obj || typeof obj !== 'object') {
            return;
        }

        if (obj.hasOwnProperty(keyToFind)) {
            result.push(obj[keyToFind]);
        }

        for (let key in obj) {
            if (obj.hasOwnProperty(key)) {
                recursiveSearch(obj[key]);
            }
        }
    }

    recursiveSearch(obj);
    return result;
}

/**
 * Marshals the licensing data into a standardized format based on the license type.
 * 
 * @param {LicensingData} data - The licensing data to be marshaled.
 * @returns {Object} The marshaled licensing information.
 */
export function marshalLicensingInfo(data: LicensingData){
    if(!data ||  !('type' in data)){
        return {}
    }

    if(data.type === MHLMLicenseType ) {
        return {
            "type": MHLMLicenseType,
            "emailAddress": data["email_addr"],
            "entitlements": data["entitlements"],
            "entitlementId": data["entitlement_id"]
        }

    } else if (data.type === NLMLicenseType) {
        return {
            "type": NLMLicenseType,
            "connectionString": data["conn_str"],
        }
    } else if (data.type === ExistingLicenseType) {
        return {
            "type": ExistingLicenseType,
        }
    } else {
        return {}
    }
}

/**
 * Marshals the error information into a standardized format.
 * 
 * @param {Error | null} error - The error object to be marshaled.
 * @returns {Object | null} The marshaled error information, or null if no error is provided.
 */
export function marshalErrorInfo(error: Error | null) : {"message": string, logs: string | null, type: string} | null {
    if (!error) return null;

    if( error instanceof AppError) {
        return {
            "message": error.message,
            "logs": error.logs,
            "type": typeof(error)
        }
    } else {
        return {
            "message": error.message,
            "type": error.constructor.name,
            "logs": null
        }
    }
}

let licensingDeleteNotificationListener : Disposable | null = null;
let licensingServerUrlNotificationListener : Disposable | null = null;

/**
 * Handles the changes to the "enableOnlineLicensing" setting in the configuration.
 * 
 * @param {Settings} configuration - The configuration object.
 * @returns {Promise<void>} A Promise that resolves when the handling is complete.
 */
export async function handleEnableOnlineLicensingSettingChanged(configuration: Settings): Promise<void> {
    if(configuration.enableOnlineLicensing){
        const licensing = new Licensing()
        if(!licensingDeleteNotificationListener){
            licensingDeleteNotificationListener = NotificationService.registerDisposableNotificationListener(
                Notification.LicensingDelete,
                async () => {
                    Logger.log("Received notification to delete licensing from the extension")
                    await licensing.unsetLicensing()
                    NotificationService.sendNotification(Notification.LicensingData, licensing.getMinimalLicensingInfo())
                }
            ) 
        }


        if(!licensingServerUrlNotificationListener){
            licensingServerUrlNotificationListener = NotificationService.registerDisposableNotificationListener(
                Notification.LicensingServerUrl,
                async () => {
                    const url = startServer(staticFolderPath);
                    Logger.log(`Received Notification requesting for licensing server url: ${url}`)
                    await sleep(1000)
                    NotificationService.sendNotification(Notification.LicensingServerUrl, url)
                }
            )
        }

        NotificationService.sendNotification(Notification.LicensingData, licensing.getMinimalLicensingInfo())    

    } else {
        if(licensingDeleteNotificationListener){
            licensingDeleteNotificationListener.dispose()
            licensingDeleteNotificationListener = null
        }


        if(licensingServerUrlNotificationListener){
            licensingServerUrlNotificationListener.dispose()
            licensingServerUrlNotificationListener = null
        }
    }
}

/**
 * Handles the changes to the "installPath" setting in the configuration.
 * 
 * @param {Settings} configuration - The configuration object.
 */
export function handleInstallPathSettingChanged(configuration: Settings): void {
    setInstallPath(configuration.installPath)        
}