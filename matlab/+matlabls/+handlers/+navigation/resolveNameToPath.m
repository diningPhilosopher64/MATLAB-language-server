function resolvedPaths = resolveNameToPath(names, contextFile)
    % RESOLVENAMETOPATH Resolves names (e.g. "plot") to the respective file path which
    % corresponds to the definition of that name.

    % Copyright 2025 The MathWorks, Inc.

    resolvedPaths = cell(1, numel(names));
    for n = 1:numel(names)
        name = names{n};
        resolvedPath = resolvePath(name, contextFile);
        resolvedPaths{n} = struct("name", name, "path", resolvedPath);
    end

    % For any names which are not found, try CDing to the context
    % file's directory and searching again
    sArray = [resolvedPaths{:}];
    missingPaths = cellfun(@isempty, {sArray.path});
    missingIndices = find(missingPaths);

    if ~isempty(missingIndices)
        returnDir = cdToPackageRoot(contextFile);
        for n = missingIndices
            resolvedPath = resolvePath(names{n}, contextFile);
            if ~isempty(path)
                resolvedPaths{n}.path = resolvedPath;
            end
        end
        cd(returnDir);
    end
end

function resolvedPath = resolvePath (name, contextFile)
    if isMATLABReleaseOlderThan('R2023b')
        % For usage in R2023a and earlier
        [isFound, resolvedPath] = matlabls.internal.resolvePath(name, contextFile);
    elseif isMATLABReleaseOlderThan('R2024a')
        % For usage in R2023b only
        [isFound, resolvedPath] = matlab.internal.language.introspective.resolveFile(name, []);
    elseif isMATLABReleaseOlderThan('R2024b')
        % For usage in R2024a only
        ec = matlab.lang.internal.introspective.ExecutionContext;
        [isFound, resolvedPath] = matlab.lang.internal.introspective.resolveFile(name, ec);
    else
        % For usage in R2024b and later
        ic = matlab.lang.internal.introspective.IntrospectiveContext.caller;
        [isFound, resolvedPath] = matlab.lang.internal.introspective.resolveFile(name, ic);
    end

    if ~isFound
        resolvedPath = '';
    end
end

function returnDir = cdToPackageRoot (filePath)
    % Given a file path, CDs to the directory at the root-level of the
    % file's package structure. If the file is not within a package,
    % this CDs to the file's directory.

    splitDirs = strsplit(fileparts(filePath), filesep);

    % Determine how far up the path we need to CD
    lastInd = numel(splitDirs);
    while lastInd > 1
        if ~startsWith(splitDirs(lastInd), '+')
            break;
        end
        lastInd = lastInd - 1;
    end

    returnDir = cd(strjoin(splitDirs(1:lastInd), filesep));
end
