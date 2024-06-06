// Copyright 2024 The MathWorks, Inc.

/**
 * Utility function to introduce a delay.
 * 
 * @param {number} ms - The delay in milliseconds.
 * @returns {Promise<void>} A Promise that resolves after the specified delay.
 */
export async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}