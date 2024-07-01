// Copyright 2024 The MathWorks, Inc.

import { promises as fs } from 'fs';
import { findExecutableOnPath, resolveSymlink } from '../utils/FsUtils';
import * as path from 'path';
import * as xml2js from 'xml2js';
import { VersionInfoXML } from './types';
import Logger from '../logging/Logger';


const VERSION_INFO_FILENAME = "VersionInfo.xml";

// TODO: Ask for minimum supported version
export const supportedVersions= ["R2021a", "R2021b","R2022a", "R2022b", "R2023a", "R2023b", "R2024a"]

let matlabRootFromExecOnPath: string | null = null;
let installPath : string | null = null;
export const staticFolderPath : string = path.join(__dirname, "licensing", "static")

/**
 * Sets the MATLAB install path
 * @param path - The MATLAB install path
 */
export function setInstallPath(path: string): void {
    installPath = path;
}

/**
 * Gets the MATLAB version
 * @returns {Promise<string | null>} The MATLAB version or null if it cannot be determined
 */
export async function getMatlabVersion(): Promise<string | null> {
    let matlabRoot : string | null = null;

    // Highest precendence given to installPath setting
    if(installPath) {
        matlabRoot = installPath
    } else {
        if(!matlabRootFromExecOnPath){
            const matlabExecutableOnPath = await findExecutableOnPath("matlab")
            // If there's no matlab executable on system PATH return
            if(!matlabExecutableOnPath){
                return null;
            }

            const absoluteMatlabPath = await resolveSymlink(matlabExecutableOnPath);
            matlabRootFromExecOnPath = matlabRoot = path.resolve(absoluteMatlabPath, '..', '..')
        } else {
            matlabRoot = matlabRootFromExecOnPath
        }
    }
           
    const versionInfoPath = path.join(matlabRoot, VERSION_INFO_FILENAME);

    try {
        const fileContent = await fs.readFile(versionInfoPath, { encoding: 'utf-8' })
        const xmlData = (await xml2js.parseStringPromise(fileContent)) as VersionInfoXML
        const versionInfo = xmlData.MathWorks_version_info.release
        return versionInfo
    } catch (error) {
        Logger.error(`Failed to read version info file at path:${versionInfoPath} with error:${error}`)
        return null;
    }
}
