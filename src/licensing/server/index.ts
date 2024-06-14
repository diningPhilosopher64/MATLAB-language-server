// Copyright 2024 The MathWorks, Inc.

import { Server as HttpServer } from 'http';
import { AddressInfo } from 'net';

import  * as express from 'express';

import { addRoutes } from './routes';

let server : HttpServer | express.Express | null = null, port: number | null = null;


/**
 * The URL of the running server.
 */
export let url: string | null = null;

/**
 * Starts the server and returns its URL.
 *
 * @param buildPath - The path to the build directory.
 * @returns {string} The URL of the running server.
 */
export function startLicensingServer(buildPath: string) : string {  
    if(url) {
      return url;
    }
    
    server = express() 
    server.use(express.static(buildPath));
    server.use(express.json());

    // Add routes
    addRoutes(server);

    // Start the server on a random port.
    const app = server.listen(0);
    const address = app.address() as AddressInfo;
    port = address.port;
    url = `http://localhost:${port}/index.html`

    return url
};

/**
 * Stops the running server.
 */
export function stopLicensingServer() : void {    
    if (server) {
        (server as HttpServer).close(() => {
          console.log('Server stopped successfully');
        });
      }
};