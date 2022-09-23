function completionResults = getCompletionsData (code, fileName, cursorPosition)
    %COMPUTECODEDATA Retrieve completion data for the given code based on the cursor position

    % Force tab completions to load, if necessary
    builtin('_programmingAidsTest', '', '', 0, []);

    % Get data
    completionsCmd = ['builtin(''_programmingAidsTest'', ' mat2str(fileName) ', ' mat2str(code) ', ' mat2str(cursorPosition) ', [])'];
    completionResults = evalin('base', completionsCmd);
end