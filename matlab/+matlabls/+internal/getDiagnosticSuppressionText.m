function [suppressionText, suppressionLine, character] = getDiagnosticSuppressionText (code, diagnosticId, diagnosticLine)
    % Finds the text which should be inserted, and the location of the
    % insertion, to suppress the provided diagnostic on the given line.

    % Get the statement's end line
    suppressionLine = findStatementEndLine(code, diagnosticLine) - 1; % 0-based

    % Tokenize the code to find where we need to insert the suppression pragma
    tok = matlab.internal.language.Tokenizer;
    splitCode = split(code, newline);
    codeLine = splitCode{suppressionLine + 1};

    tokens = tok.tokenize(codeLine);

    if isEolToken(tokens(end).token)
        tokens = tokens(1 : end-1);
    end
 
    % Case 1: empty line -> append full pragma
    if numel(tokens) == 0
        [character, suppressionText] = handleAddSuppressionToLine([], codeLine, diagnosticId);
        return
    end

    lastToken = tokens(end);
    if isCommentToken(lastToken.token)
        % Case 2: comment on line -> append full pragma BEFORE comment
        [character, suppressionText] = handleSuppressionBeforeComment(lastToken, tokens, diagnosticId);
        return
    elseif isPragmaToken(lastToken.token)
        % Case 3: pragma on line -> append suppression ID to pragma contents
        [character, suppressionText] = handleSuppressionWithExistingPragma(lastToken, tokens, codeLine, diagnosticId);
    else
        % Case 4: just code on line -> append full pragma
        [character, suppressionText] = handleAddSuppressionToLine(lastToken, codeLine, diagnosticId);
    end
end

function endLineNumber = findStatementEndLine (code, lineNumber)
    % In the given code, find the last line (1-based) of the
    % statement containin the provided line number (1-based).
    % Takes into account things like line continuations (...)
    % and multi-line array declarations.

    % Copyright 2022 - 2023 The MathWorks, Inc.

    t = mtree(code);
    if t.mtfind('Kind', 'ERR').count == 0
        % Find left and right bounds of command
        [leftLine, ~] = t.pos2lc(t.lefttreepos);
        [rightLine, ~] = t.pos2lc(t.righttreepos);

        % Look for non-control flow lines
        ncfidx = findNonControlFlow(t);
        leftLine = leftLine(ncfidx);
        rightLine = rightLine(ncfidx);

        % Find requested line
        match = (leftLine == lineNumber);
        if ~any(match)
            endLineNumber = lineNumber;
            return
        end
        endLineNumber = rightLine(match);
        endLineNumber = max(endLineNumber(:));
    else
        % Parsing failed due to syntax error.
        % Fall back to looking for "..."
        lines = split(string(code), newline);
        for n = lineNumber:numel(lines)
            lineText = lines(n);
            if ~contains(lineText, '...')
                break
            end
        end
        endLineNumber = n;
    end
end

function idx = findNonControlFlow (t)
    % Returns indices of non-control flow nodes
    k = t.kinds;
    lidx = cellfun(@isNotControlFlow, k, 'UniformOutput', true);
    idx = find(lidx);
end

function p = isNotControlFlow (kind)
    % Determines whether the given node kind is of a non-control kind (e.g. not "IF" or "WHILE")
    switch (kind)
        case {'FUNCTION', 'IF', 'ELSEIF', 'ELSE', 'IFHEAD', 'FOR', 'WHILE', 'SWITCH', 'CASE',...
                'OTHERWISE', 'TRY', 'CATCH', 'PROPERTIES', 'METHODS', 'ENUMERATION'}
            p = false;
        otherwise
            p = true;
    end
end

function [character, suppressionText] = handleAddSuppressionToLine (lastToken, lineText, diagnosticId)
    suppressionText = append('%#ok<', diagnosticId, '>');

    if isempty(lastToken)
        % Case A: Empty line
        character = 0;
    else
        % Case B: Non-empty line
        character = strlength(lineText);
        if ~isWhitespaceToken(lastToken.token)
            % Check if last token is whitespace - if not, will need to pad with additional space
            suppressionText = append(' ', suppressionText);
        end
    end
end

function [character, suppressionText] = handleSuppressionBeforeComment (commentToken, lineTokens, diagnosticId)
    character = commentToken.Offset - 1;
    suppressionText = append('%#ok<', diagnosticId, '> ');
    if numel(lineTokens) >= 2
        % Check if previous token is whitespace - if not, will need to pad with additional space
        previousToken = lineTokens(end - 1);
        if ~isWhitespaceToken(previousToken.token)
            suppressionText = append(' ', suppressionText);
        end
    end
end

function [character, suppressionText] = handleSuppressionWithExistingPragma (pragmaToken, lineTokens, lineText, diagnosticId)
    pragmaString = lineText(pragmaToken.Offset : pragmaToken.Offset + uint32(pragmaToken.Length) - 1);
    [ind, match] = regexp(pragmaString, '%#ok<[*a-zA-Z, ]*>', 'start', 'match');

    % Case A: Missing suppression pragma -> append full pragma before existing pragma
    if isempty(ind)
        character = pragmaToken.Offset - 1;
        suppressionText = append('%#ok<', diagnosticId, '> ');
        if numel(lineTokens) >= 2
            % Check if previous token is whitespace - if not, will need to pad with additional space
            previousToken = lineTokens(end - 1);
            if ~isWhitespaceToken(previousToken.token)
                suppressionText = append(' ', suppressionText);
            end
        end
        return
    end

    % Case B: Pragma is suppression pragma -> append diagnostic ID within the existing pragma
    suppressionText = diagnosticId;
    character = (pragmaToken.Offset - 1) + (ind(1) - 1) + 5; % Add 5 to offset to just after the '<'
    if isempty(regexp(match{1}, '%#ok< *>', 'once'))
        % If there are existing diagnostics being filtered, add comma to separate diagnostic IDs
        suppressionText = append(suppressionText, ',');
        return
    end
end

function isEol = isEolToken (token)
    eolTokens = [100 101 102 103];
    isEol = any(eolTokens == token);
end

function isComment = isCommentToken (token)
    isComment = token == 105;
end

function isPragma = isPragmaToken (token)
    isPragma = token == 110;
end

function isWhitespace = isWhitespaceToken (token)
    isWhitespace = token == 116;
end
