function analysisObject = analyzeCode(codeToFold)
    % ANALYZECODE Parses MATLAB® code to extract code structure
    % rest of comment TBD

    % Copyright 2024 The MathWorks, Inc.
    analysisObject = matlab.codeanalyzer.internal.analyzeCode(codeToFold);
end
