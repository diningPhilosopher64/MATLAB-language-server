function analysisObject = analyzeCode(codeToFold)
    % Call analyzeCode API
    analysisObject = matlab.codeanalyzer.internal.analyzeCode(codeToFold);
end