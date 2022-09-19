function endLineNumber = findStatementEndLine (code, lineNumber)
    % In the given code, find the last line (1-based) of the
    % statement containin the provided line number (1-based).
    % Takes into account things like line continuations (...)
    % and multi-line array declarations.

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
