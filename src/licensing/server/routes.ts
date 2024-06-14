// Copyright 2024 The MathWorks, Inc.

import { getEnvConfig, getStatus, setLicensingInfo, deleteLicensingInfo, updateEntitlement, fallbackEndpoint } from './routeHandlers';

import { Express } from 'express';

/**
 * Adds routes to the express application 
 * @param app - The Express application object.
 */
export function addRoutes(app: Express) {
    app.get('/get_env_config', getEnvConfig);
    app.get('/get_status', getStatus);
    app.put('/set_licensing_info', setLicensingInfo);
    app.put('/update_entitlement', updateEntitlement);
    app.delete('/set_licensing_info', deleteLicensingInfo);
    
    // Fallback endpoint for handling requests coming in from react
    // NOTE: Comment out if working with react dev server
    app.get('*', fallbackEndpoint);
};

