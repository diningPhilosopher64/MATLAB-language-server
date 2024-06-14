// Copyright 2024 The MathWorks, Inc.

import fetch, { RequestInit, Response } from 'node-fetch';

/**
 * Sends an HTTP request to the specified URL with the provided options.
 *
 * @param url - The URL to send the request to.
 * @param options - The options for the request.
 * @returns {Promise<Response | null>} A Promise that resolves with the Response object if the request is successful, or null if an error occurs.
 */
export default async function sendRequest(url: string, options: RequestInit): Promise<Response | null> {
    try{
        const response = await fetch(url, options)
        if (!response.ok) {
            throw  new Error(`Error: ${response.status}`);
        }

        return response;
 
    } catch (error) {
        console.error("Failed to send HTTP request: ", error)
        return null;
    }
}