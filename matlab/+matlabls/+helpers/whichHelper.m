function fileInfo = whichHelper(containingFile, name)
    % WHICHHELPER Helps determine the file which most likely contains the
    % provided identifier from the perspective of the containingFile.
    %
    % For example, if file "foo.m" refers to "ClassName", gets file most
    % likely containing the definition of "ClassName".

    [containingFile, name] = convertCharsToStrings(containingFile, name);

    % Restore current directory when done
    currentDirectory = pwd;
    cleanupFcn = onCleanup(@() cd(currentDirectory));

    fileInfo = {};
    containingDir = fileparts(containingFile);

    % 1. Look within a private directory
    privateDir = fullfile(containingDir, "private");
    if isfolder(privateDir)
        checkedCd(privateDir)
        file = which(name);
        if isfile(file)
            fileInfo = computeFileInfo(file, name);
            return
        end
    end

    % 2. Look within @ directory for @class/name.m
    pathParts = split(containingDir, filesep);
    isClassDir = ~isempty(pathParts) && startsWith(pathParts(end), "@");
    fcnFile = fullfile(containingDir, strcat(name, ".m"));
    if isClassDir && isfile(fcnFile)
        fileInfo = computeFileInfo(fcnFile, name);
        return
    end

    % 3. Look on the path from this directory
    if isfolder(containingDir) && ~isClassDir
        % Don't CD into class directory - this just confuses the path
        checkedCd(containingDir)
    end
    file = which(name);

    % 4. Look in parent directories, skipping +package and @class folders
    if isempty(file)
        pathIdx = -1;
        for k = numel(pathParts):-1:1
            if ~(startsWith(pathParts(k), "+") || startsWith(pathParts(k), "@"))
                pathIdx = k;
                break;
            end
        end

        if pathIdx > 0
            checkedCd(join(pathParts(1:pathIdx), filesep))
            file = which(name);
        end
    end

    % 5. Check for identifiers in dot-chains
    % For example, a.b in a.b.c could be a class name for an enum
    requireSymbolSearch = false;
    if isempty(file)
        identifierParts = split(name, ".");
        if numel(identifierParts) > 1
            frontEnd = join(identifierParts(1:end - 1), ".");
            file = which(frontEnd);
            requireSymbolSearch = true;
        end
    end

    if isempty(file)
        % Did not find anything
        return
    end

    fi = computeFileInfo(file, name);
    if requireSymbolSearch && fi.line <= 1
        % We didn't actually find the symbol in the file
        return
    end
    fileInfo = fi;
end

function checkedCd(newDir)
    previousDirectory = pwd;
    cd(newDir)
    [~, warnId] = lastwarn();
    if warnId == "MATLAB:dispatcher:nameConflict"
        % Name conflicts which may cause things to misbehave
        cd(previousDirectory)
        lastwarn("")
    end
end

function fileInfo = computeFileInfo(file, name)
    if ~isfile(file)
        % Handle built-ins
        tempFile = regexp(file, "built-in\s*\((.*)\)", "tokens");
        if numel(tempFile) == 1
            tempFile = strcat(tempFile{1}{1}, ".m");
        end
        if isfile(tempFile)
            file = tempFile;
        end
    end

    if isfile(file)
        % Handle .p files
        [directoryName, fileName, extension] = fileparts(file);
        if strcmpi(extension, ".p")
            mFile = fullfile(directoryName, strcat(fileName, '.m'));
            if isfile(mFile)
                file = mFile;
            end
        end
    end

    if ~isfile(file)
        % File does not exist
        fileInfo = [];
        return
    end

    code = string(fileread(file));
    codeData = matlabls.internal.computeCodeData(code, file);
    nameEnd = split(name, ".");
    nameEnd = nameEnd(end);
    symbolInfo = [];

    fileInfo = struct(fileName = file, line = 0, char = 0, codeData = codeData);

    % 1. Look for enums or properties matching the name
    if codeData.classInfo.isClassDef
        symbolInfo = findInCell(codeData.classInfo.enumerations, nameEnd);
        if isempty(symbolInfo)
            symbolInfo = findInCell(codeData.classInfo.properties, nameEnd);
        end
    end

    % 2. Look for methods and functions
    functionInfo = codeData.functionInfo;
    if isempty(symbolInfo)
        if isempty(functionInfo)
            return
        end
        symbolInfo = findInCell(functionInfo, nameEnd);
    end

    if isempty(symbolInfo)
        % Symbol not found in file
        return
    end

    fileInfo.line = symbolInfo.lineStart;
    fileInfo.char = symbolInfo.charStart;
end

function symbolInfo = findInCell(cellArr, name)
    % Look through the provided cell array of location information for an
    % entry matching the given name.
    symbolInfo = [];
    for k = 1:numel(cellArr)
        propData = cellArr{k};
        if strcmp(propData.name, name)
            symbolInfo = propData;
            return
        end
    end
end
