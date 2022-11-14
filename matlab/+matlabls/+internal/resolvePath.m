function path = resolvePath (name, contextFile)
    % RESOLVEPATH Attempt to determine the file which most likely contains
    % the provided identifier from the perspective of the context file.
    %
    % For example, if file "foo.m" refers to "ClassName", this returns the
    % file most likely containing the definition of "ClassName", or an
    % empty string if that file could not be determined.

    elementName = name;

    % The given identifier may be a reference within a class (e.g. 'obj.Prop')
    removeDot = count(name, '.') == 1;
    if removeDot
        nameResolver = matlab.internal.language.introspective.resolveName(name);
        if isempty(nameResolver.classInfo)
            elementName = extractAfter(name, '.');
        end
    end

    % Check for targets within the context file
    if isvarname(elementName) || iskeyword(elementName)
        nameResolver = matlab.internal.language.introspective.resolveName(contextFile);
        if ~isempty(nameResolver.classInfo) && (nameResolver.classInfo.isClass || nameResolver.classInfo.isMethod)
            classInfo = nameResolver.classInfo;
            className = matlab.internal.language.introspective.makePackagedName(classInfo.packageName, classInfo.className);
            targetName = append(className, '.', elementName);
            nameResolver = matlab.internal.language.introspective.resolveName(targetName);
            if nameResolver.isResolved
                if nameResolver.isCaseSensitive || isempty(matlab.internal.language.introspective.safeWhich(name, true))
                    % Target not found within file. Broaden search (e.g. look in base classes)
                    path = doEditResolve(targetName);

                    return;
                end
            end
        end
    end

    % Check for targets elsewhere
    path = doEditResolve(name);
end

function path = doEditResolve (name)
    % Attempt to resolve the name in the same way that edit.m does

    [name, hasLocalFunction, result, ~, path] = matlab.internal.language.introspective.fixLocalFunctionCase(name);

    if hasLocalFunction
        % Handle a situation like `myFunc>localFunc`
        if result && path(end) == 'p'
            % See if a corresponding M file exists
            path(end) = 'm';
            if ~isfile(path)
                path = '';
                return;
            end
        end

        if ~result
            path = '';
            return;
        end
    else
        classResolver = matlab.internal.language.introspective.NameResolver(name, '', false);
        if isprop(classResolver, 'findBuiltins')
            classResolver.findBuiltins = false;
        end
        classResolver.executeResolve();

        if isprop(classResolver, 'resolvedSymbol')
            resolvedSymbol = classResolver.resolvedSymbol;
            classInfo = resolvedSymbol.classInfo;
            whichTopic = resolvedSymbol.nameLocation;
        else
            classInfo = classResolver.classInfo;
            whichTopic = classResolver.nameLocation;
        end

        if isempty(whichTopic)
            [~, path] = resolveWithFileSystemAndExts(name);
        else
            % whichTopic is the full path to the resolved output either by class
            % inference or by which

            switch exist(whichTopic, 'file')
                case 0 % Name resolver found something which is not a file
                    whichTopic = classInfo.definition;
                case 3 % MEX File
                    path = '';
                    return
                case {4, 6} % P File or Simulink Model
                    % See if a corresponding M file exists
                    mTopic = regexprep(whichTopic, '\.\w+$', '.m');
                    if isfile(mTopic)
                        whichTopic = mTopic;
                    else
                        path = '';
                        return
                    end
            end

            if matlab.desktop.editor.EditorUtils.isAbsolute(whichTopic)
                path = whichTopic;
            else
                path = which(whichTopic);
            end
        end
    end
end

function result = hasExtension(s)
    % Helper method that determines if filename specified has an extension.
    % Returns 1 if filename does have an extension, 0 otherwise
    [~,~,ext] = fileparts(s);
    result = ~isempty(ext);
end

function [result, absPathname] = resolveWithFileSystemAndExts(argName)
    % Helper method that checks the filesystem for files by adding m or mlx    
    result = 0;

    if ~hasExtension(argName)
        argMlx = [argName '.mlx'];
        [result, absPathname] = resolveWithDir(argMlx);

        if ~result
            argM = [argName '.m'];
            [result, absPathname] = resolveWithDir(argM);
        end
    end

    if ~result
        absPathname = '';
    end
end

function [result, absPathname] = resolveWithDir(argName)
    % Helper method that checks the filesystem for files    
    result = 0;
    absPathname = '';

    dir_result = dir(argName);

    if isempty(dir_result) && isSimpleFile(argName)
        dir_result = dir(fullfile('private', argName));
    end

    if ~isempty(dir_result)
        if (numel(dir_result) == 1) && ~dir_result.isdir
            result = 1;  % File exists
            absPathname = fullfile(dir_result.folder, dir_result.name);
        end
    end
end

function result = isSimpleFile(file)
    % Helper method that checks for directory seps.
    result = false;
    if isunix
        if ~contains(file, '/')
            result = true;
        end
    else % on windows be more restrictive
        if ~contains(file, ["\", "/", ":"]) % need to keep : for c: case
            result = true;
        end
    end
end
