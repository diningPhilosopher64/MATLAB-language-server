function foldingRanges = analyzeCode(codeToFold)
    % ANALYZECODE Parses MATLAB® code to extract folding ranges.
    % The data is an array of line numbers. Each consecutive pair of
    % numbers represents the start and end lines of a folding ranges.

    % Copyright 2024 The MathWorks, Inc.

    analysisObject = matlab.codeanalyzer.internal.analyzeCode(codeToFold);

    % Get folding ranges
    foldingRanges = [];
    foldingRanges = getFoldingRanges(analysisObject.CodeStructures, foldingRanges);

end

function fRangesArray = getFoldingRanges(codeStructs, fRangesArray)
    % Handle codeStructs array (multiple code structures)
    for i=1:length(codeStructs)
        % Do not get folding ranges for blocks that are not foldable in MATLAB
        if(~ismember(codeStructs(i).Type, {'elseifBlock', 'elseBlock', 'catchBlock'})) 
            fRangesArray = [fRangesArray, codeStructs(i).StartLine, codeStructs(i).EndLine];
        end
        % Get folding ranges for nested structures
        if(~isempty(codeStructs(i).NestedStructures))
            fRangesArray = getFoldingRanges(codeStructs(i).NestedStructures, fRangesArray);
        end
    end
end
