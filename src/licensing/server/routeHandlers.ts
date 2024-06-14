// Copyright 2024 The MathWorks, Inc.

import { Request, Response } from 'express';
import * as path from 'path';
import { getMatlabVersion, supportedVersions } from '../config';
import Licensing from '../index';
import { marshalErrorInfo, marshalLicensingInfo } from '../../utils/LicensingUtils';
import MatlabLifecycleManager from '../../lifecycle/MatlabLifecycleManager';

let matlabVersion: string | null = null;

/**
 * Retrieves the environment configuration including the MATLAB version and supported versions.
 * @param _req - The Express request object (not used).
 * @param res - The Express response object.
 */
export async function getEnvConfig (_req : Request, res : Response)  {
    matlabVersion = await getMatlabVersion();    
    res.send({"matlab":{"version": matlabVersion, "supportedVersions": supportedVersions}})
};

/**
 * Retrieves the licensing status, including MATLAB version, licensing information, error information, and warnings.
 * @param _req - The Express request object (not used).
 * @param res - The Express response object.
 */
export async function getStatus(_req : Request, res : Response) {    
    const licensing = new Licensing();
    const status = {
        "matlab": {
            "version": matlabVersion,
        },
        
        "licensing": marshalLicensingInfo(licensing.data),
        "error": marshalErrorInfo(licensing.error), 
        "warnings": [],
        "wsEnv": Licensing.wsEnvSuffix
    }

  return res.send(status)
};

/**
 * Sets the licensing information for MATLAB.
 * @param req - The Express request object containing the licensing information in the request body.
 * @param res - The Express response object.
 */
export async function setLicensingInfo(req : Request, res : Response) { 
    const licensing = new Licensing();   
    const jsonData = req.body
    await licensing.setLicensingInfo(jsonData)

    const status = {
        "matlab": {
        "version": matlabVersion
        },
        "wsEnv": Licensing.wsEnvSuffix,
        "error": marshalErrorInfo(licensing.error), 
        "warnings": [],
        "licensing": marshalLicensingInfo(licensing.data)
    }

    // Start licensed MATLAB
    MatlabLifecycleManager.eventEmitter.emit('StartLicensedMatlab')
    return res.send(status)
};

/**
 * Deletes the licensing information for MATLAB.
 * @param _req - The Express request object (not used).
 * @param res - The Express response object.
 */
export async function deleteLicensingInfo(_req : Request, res : Response) {    
    const licensing = new Licensing();
    await licensing.unsetLicensing()

    const status = {
        "matlab": {
        "version": matlabVersion
        },
        "wsEnv": Licensing.wsEnvSuffix,
        "error": marshalErrorInfo(licensing.error), 
        "warnings": [],
        "licensing": marshalLicensingInfo(licensing.data)
    }

    return res.send(status)
};

/**
 * Updates the user-selected entitlement information for MATLAB.
 * @param req - The Express request object containing the entitlement ID in the request body.
 * @param res - The Express response object.
 */
export async function updateEntitlement(req: Request, res: Response) {
    const licensing = new Licensing();   
    const jsonData = req.body

    const entitlementId = jsonData["entitlementId"]

    licensing.updateUserSelectedEntitlementInfo(entitlementId)

    const status = {
        "matlab": {
        "version": matlabVersion
        },
        "wsEnv": Licensing.wsEnvSuffix,
        "error": marshalErrorInfo(licensing.error), 
        "warnings": [],
        "licensing": marshalLicensingInfo(licensing.data)
    }

    return res.send(status)
}

/**
 * Fallback endpoint for handling requests coming from the React application.
 * Serves the index.html file from the build directory.
 * @param _req - The Express request object (not used).
 * @param res - The Express response object.
 */
export async function fallbackEndpoint(_req : Request, res : Response) {
    res.sendFile(path.join(__dirname + '/build/index.html'));
};
