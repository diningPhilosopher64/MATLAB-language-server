import { CliArgs } from '../utils/CliUtils'

export enum Argument {
    // Basic arguments
    MatlabLaunchCommandArguments = 'matlabLaunchCommandArgs',
    MatlabCertificateDirectory = 'matlabCertDir',
    MatlabInstallationPath = 'matlabInstallPath',
    MatlabConnectionTiming = 'matlabConnectionTiming',

    // Advanced arguments
    MatlabUrl = 'matlabUrl'
}

class ArgumentManager {
    private readonly _argMap = new Map<Argument, unknown>()

    /**
     * Initialize the map with the provided arguments
     *
     * @param cliArgs The parsed CLI arguments
     */
    initializeFromCliArguments (cliArgs: CliArgs): void {
        Object.values(Argument).forEach(arg => {
            this.setArgument(arg, cliArgs[arg])
        })
    }

    /**
     * Sets an argument to a new value
     *
     * @param argument The argument being set
     * @param value The argument's new value
     */
    setArgument (argument: Argument, value: unknown): void {
        this._argMap.set(argument, value)
    }

    /**
     * Gets the value of the given argument
     *
     * @param argument The argument
     * @returns The argument's value
     */
    getArgument (argument: Argument): unknown {
        return this._argMap.get(argument)
    }
}

export default new ArgumentManager()
