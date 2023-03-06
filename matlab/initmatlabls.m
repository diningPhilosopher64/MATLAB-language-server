% Copyright 2022 - 2023 The MathWorks, Inc.

function initmatlabls (outFile)
    % Initializes a MATLAB session to talk to a MATLAB language server.
    % Writes connection info to the outFile specified by the client

    % Prevent clearing the workspace from cleaning up the MatlabLanguageServerHelper
    mlock

    disp("matlabls: Beginning initialization")
    fprintf("matlabls: matlabroot is \n%s\n", matlabroot)

    % Ensure the language server code is on the path
    addpath(fileparts(mfilename("fullpath")))

    % Create matlabls helper for calculating language server operations
    persistent matlablsHelper %#ok<PUSE>
    matlablsHelper = matlabls.MatlabLanguageServerHelper();

    if nargin == 1
        logConnectionData(outFile)
    end

    disp("matlabls: Initialization complete")
end

function logConnectionData (outFile)
    c.matlabPid = feature("getpid");
    connectionData = jsonencode(c);

    disp(strcat("Printing connection data to file: ", newline, "    ", outFile))

    f = fopen(outFile, "w");
    fprintf(f, "%s\n", connectionData);
    fclose(f);
end
