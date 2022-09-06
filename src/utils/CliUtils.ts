import * as yargs from 'yargs'

export interface CliArgs {
    matlabLaunchCommandArgs?: string
    matlabCertDir?: string
    matlabInstallPath?: string
    matlabConnectionTiming?: string
    matlabUrl?: string
}

/**
 * Creates a yargs parser to extract command line arguments.
 *
 * @returns The parsed command line arguments
 */
function makeParser (): yargs.Argv<CliArgs> {
    const argParser = yargs.option('matlabLaunchCommandArgs', {
        description: 'Arguments passed to MATLAB when launching',
        type: 'string',
        requiresArg: true
    }).option('matlabCertDir', {
        description: 'Location at which to look for a MATLAB certificate',
        type: 'string'
    }).option('matlabInstallPath', {
        description: 'The full path to the top-level directory of the MATLAB installation. If not specified, the environment path will be checked for the location of the `matlab` executable.',
        type: 'string',
        default: ''
    }).option('matlabConnectionTiming', {
        description: 'When the language server should attempt to connect to MATLAB.',
        type: 'string',
        default: 'early',
        choices: ['early', 'late', 'never']
    }).option('matlabUrl', {
        type: 'string',
        description: 'URL for communicating with an existing MATLAB instance',
        requiresArg: true
    }).usage(
        'Usage: $0 {--node-ipc | --stdio | --socket=socket} options\n' +
        '\n' +
        '\tAn LSP server for MATLAB. This is meant to be invoked from an editor or IDE.\n'
    ).group(
        ['node-ipc', 'stdio', 'socket'],
        'Required IPC flag'
    ).option('node-ipc', {
        description: 'Use Node IPC'
    }).option('stdio', {
        description: 'Use stdio for IPC'
    }).option('socket', {
        description: 'Use specified socket for IPC',
        requiresArg: true
    }).help('help').alias('h', 'help')

    return argParser
}

/**
 * Parse the command line arguments.
 *
 * @param args If provided, these are the arguments to parse. Otherwise, the true
 * command line arguments will be parsed. This is primarily meant for testing.
 * @returns The parsed CLI arguments
 */
export function getCliArgs (args?: string[]): CliArgs {
    const cliParser = makeParser()
    return (args != null) ? cliParser.parseSync(args) : cliParser.parseSync()
}
