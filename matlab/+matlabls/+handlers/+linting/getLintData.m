function lintData = getLintData(code, fileName)
    % LINTDATA Gathers linting data for the provided MATLAB® code.

    % Copyright 2025 The MathWorks, Inc.

    lintData = checkcode('-text', code, fileName, '-id', '-severity', '-fix', '-string');
    lintData = split(deblank(lintData), newline);
    lintData(cellfun(@isempty, lintData)) = [];
end
