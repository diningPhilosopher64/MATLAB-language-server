// Copyright 2022 - 2025 The MathWorks, Inc.

import { URI } from 'vscode-uri'
import MVM from '../../mvm/impl/MVM'
import Logger from '../../logging/Logger'

interface ResolvedPath {
    name: string
    path: string
}

interface ResolvedUri {
    name: string
    uri: string
}

class PathResolver {
    constructor (private readonly mvm: MVM) {}

    /**
     * Attempts to resolve the given names to the files in which the names are defined.
     * For example, 'MyClass' may be resolved to 'file:///path/to/MyClass.m'.
     *
     * @param names The names which should be resolved to paths
     * @param contextFileUri The file from which the context of the path resolution should be made
     * @param matlabConnection The connection to MATLAB®
     *
     * @returns The resolved URIs. Any URIs which could not be determiend are denoted by empty strings.
     */
    async resolvePaths (names: string[], contextFileUri: string): Promise<ResolvedUri[]> {
        const contextFile = URI.parse(contextFileUri).fsPath

        try {
            const response = await this.mvm.feval<ResolvedPath[]>(
                'matlabls.handlers.navigation.resolveNameToPath',
                1,
                [names, contextFile]
            )

            if ('error' in response) {
                Logger.error('Error received while resolving paths:')
                Logger.error(response.error.msg)
                return []
            }

            return response.result[0].map(resolvedPath => {
                const filePath = resolvedPath.path
                const uri = (filePath === '') ? '' : URI.file(filePath).toString()
                return {
                    name: resolvedPath.name,
                    uri
                }
            })
        } catch (err) {
            Logger.error('Error caught while resolving paths:')
            Logger.error(err as string)
            return []
        }
    }
}

export default PathResolver
