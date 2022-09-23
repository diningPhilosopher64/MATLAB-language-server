function codeInfo = computeCodeData (code, filePath)
    %COMPUTECODEDATA Compute sub-function location information for the
    % MATLAB code file specified by fullpath. The data is a struct:
    %
    %   codeInfo.classInfo    - Information about class definitions, if applicable
    %   codeInfo.functionInfo - Information about function definitions
    %   codeInfo.packageName  - The package name, if the code is within a package
    %   codeInfo.references   - Data about all functions referenced in the code
    %
    % Where classInfo is a struct:
    %
    %   codeInfo.classInfo.isClassDef
    %   codeInfo.classInfo.hasClassInfo
    %   codeInfo.classInfo.name
    %   codeInfo.classInfo.range
    %   codeInfo.classInfo.declaration
    %   codeInfo.classInfo.properties
    %   codeInfo.classInfo.enumerations
    %   codeInfo.classInfo.classDefFolder
    %   codeInfo.classInfo.baseClasses
    %
    % and functionInfo is an array of struct:
    %
    %   codeInfo.functionInfo(k).name
    %   codeInfo.functionInfo(k).range
    %   codeInfo.functionInfo(k).declaration
    %   codeInfo.functionInfo(k).parentClass
    %   codeInfo.functionInfo(k).isPublic
    %   codeInfo.functionInfo(k).variableInfo
    %   codeInfo.functionInfo(k).globals
    %   codeInfo.functionInfo(k).isPrototype
    
    timeStart = tic;

    functionMap = containers.Map('KeyType', 'char', 'ValueType', 'any');
    functionReferences = {};

    %% Handle very large input
    MAXCODE = 500000;
    if strlength(code) > MAXCODE
        % File too large - do not try to index
        code = '';
    end

    %% Get data about containing directory
    [directory, ~, ~] = fileparts(filePath);
    dirParts = split(string(directory), filesep);

    % Determine if in classdef folder (i.e. a folder name starting with '@')
    isInClassDefFolder = startsWith(dirParts(end), '@');
    
    % Determine if in package (i.e. folder(s) starting with '+')
    codeInfo.packageName = dirParts(dirParts.startsWith('+')).replace('+', '').join('.');
    if ismissing(codeInfo.packageName)
        codeInfo.packageName = '';
    end
    
    %% Parse code
    mt = mtree(code);
    
    %% Parse class data
    classInfo = struct( ...
        'isClassDef', false, ...
        'hasClassInfo', false, ...
        'name', '', ...
        'range', createRange(), ...
        'declaration', createRange(), ...
        'properties', cell(1), ...
        'enumerations', cell(1), ...
        'classDefFolder', '', ...
        'baseClasses', cell(1) ...
    );
    
    if isInClassDefFolder
        classInfo.classDefFolder = directory;
    end

    % Parse class definition
    classNode = mt.Cexpr;

    if classNode.count > 0
        classInfo.isClassDef = true;
        classInfo.hasClassInfo = true;
        
        % Parse any class inheritance
        if classNode.kind == "LT" % Class inherits
            classInfo.baseClasses = classNode.Right.Full.mtfind('Kind', 'ID').strings();
            classNode = classNode.Left;
        end

        classInfo.name = classNode.string;

        % Get full range of class definition (from "classdef" to "end")
        classDefNode = mt.mtfind('Kind', 'CLASSDEF');
        classInfo.range = getRangeForNodes(classDefNode);

        % Get the range of the class declaration (e.g. "classdef foo < a & b")
        cexprNode = mt.mtfind('Kind', 'CEXPR');
        classInfo.declaration = getRangeForNodes(cexprNode);
    end

    if classInfo.isClassDef
        % Parse class properties, methods, and enums
        block = classDefNode.Body.first;
        while block.count > 0
            switch block.kind
                case 'PROPERTIES'
                    %% Parse class properties
                    propertyDeclNode = block.Body.List.Left;
                    typeDeclNodes = propertyDeclNode.mtfind('Kind', 'PROPTYPEDECL').VarName;
                    propertyNames = typeDeclNodes.strings();
                    ranges = getRangeForNodes(typeDeclNodes);
                    propertyIds = propertyDeclNode.mtfind('Kind', 'ID');
                    propertyNames = [propertyNames, strings(propertyIds)]; %#ok<AGROW>
                    ranges = accumulateRangesForNodes(propertyIds, ranges);

                    for k = 1:numel(propertyNames)
                        classInfo.properties{end + 1} = createMemberInfo(propertyNames{k}, ranges(k), classInfo.name, false);
                    end
                case 'METHODS'
                    %% Parse class methods
                    functionDecl = block.Body;
                    while functionDecl.count > 0
                        functionReferences = parseFunctionData(functionDecl, true, true, classInfo.name, functionMap, functionReferences);
                        functionDecl = functionDecl.Next;
                    end
                case 'ENUMERATION'
                    %% Parse class enums
                    enumDeclNode = block.Body.List;

                    % First, go through all non-initialized values
                    enumIds = enumDeclNode.mtfind('Kind', 'ID');
                    enumNames = enumIds.strings();
                    ranges = getRangeForNodes(enumIds);

                    % Second, go through all initialized values
                    enumIds = enumDeclNode.mtfind('Kind', 'LP').Left;
                    enumNames = [enumNames, enumIds.strings()]; %#ok<AGROW>
                    ranges = accumulateRangesForNodes(enumIds, ranges);

                    for k = 1:numel(enumNames)
                        classInfo.enumerations{end + 1} = createMemberInfo(enumNames{k}, ranges(k), classInfo.name, false);
                    end
            end
            block = block.Next;
        end

        % Add in local functions defined after the classdef
        functionDecl = classDefNode.Next;
        while functionDecl.count > 0
            functionReferences = parseFunctionData(functionDecl, false, false, classInfo.name, functionMap, functionReferences);
            functionDecl = functionDecl.Next;
        end
    end

    codeInfo.classInfo = classInfo;

    %% Parse Non-Classdef Data
    if ~classInfo.isClassDef && mt.count > 0
        % File is not a classdef file
        rootNode = mt.root;

        isClassDef = false;

        if isInClassDefFolder
            %% Handle parsing functions in @ directory
            isClassDef = true;

            className = char(replace(dirParts(end), '@', ''));
            codeInfo.classInfo.hasClassInfo = true;
            codeInfo.classInfo.name = className;
        else
            %% Handle parsing non-class function files
            className = codeInfo.classInfo.name;
        end

        functionNodes = rootNode.List.mtfind('Kind', 'FUNCTION'); % All top-level functions

        isPublic = true;
        for ind = functionNodes.indices
            functionNode = functionNodes.select(ind);
            functionReferences = parseFunctionData(functionNode, isPublic, isClassDef, className, functionMap, functionReferences);
            isPublic = false; % Assume first function in file is public, and the rest are private
            isClassDef = false; % Any functions beyond the first are private, and so not part of the class definition
        end
    end

    %% Parse function calls (e.g. foo(a,b,c))
    functionCalls = mt.mtfind('Isfun', true); % Includes calls to any function (local, nested, external, or other variables which code analyzer thinks might be functions)
    ranges = getRangeForNodes(functionCalls);
    functions = functionCalls.strings();

    % Pre-allocate some space in the references array to improve performance
    startIndex = numel(functionReferences);
    functionReferences = [functionReferences cell(1, numel(functions))];
    for k = 1:numel(functions)
        functionName = functions{k};
        functionReferences{startIndex + k} = { functionName, ranges(k) };
    end


    %% Finalize Data
    codeInfo.functionInfo = functionMap.values;
    codeInfo.references = functionReferences;

    %% Finalize timing
    codeInfo.timeToIndex = toc(timeStart);
end

% --------- Other Parsers ---------- %
function functionReferences = parseFunctionData (functionNode, isPublic, isClassDef, className, functionMap, functionReferences)
    functionName = functionNode.Fname.string();
    functionDeclRange = getRangeForNodes(functionNode);
    functionInfo = createMemberInfo(functionName, functionDeclRange, className, isPublic);


    %% Variable and assignment information
    variableInfo = struct();

    % Get persistent and global variables - treat the declaration line as the definition
    persistentVarNodes = functionNode.Body.Full.mtfind('Kind', 'PERSISTENT').Arg.List;
    variableInfo = addVariableDefinitions(persistentVarNodes, variableInfo);
    globalVarNodes = functionNode.Body.Full.mtfind('Kind', 'GLOBAL').Arg.List;
    variableInfo = addVariableDefinitions(globalVarNodes, variableInfo);

    % Get function inputs/outputs - treat the function header as the definition
    variableInfo = addVariableDefinitions(functionNode.Ins.List, variableInfo);
    variableInfo = addVariableDefinitions(functionNode.Outs.List, variableInfo);

    % Parse Arguments block as definitions
    variableInfo = addArgumentsInfo(functionNode, variableInfo);

    % Parse variable assignments
    body = functionNode.Tree;
    variableInfo = addVariableDefinitions(body.asgvars, variableInfo); % Note: asgvars - for all nodes selected, find the left sides of any assignments
    variableInfo = addVariableReferences(body.mtfind('Isvar', true), variableInfo); % Find variables
    
    %% Collect data
    functionInfo.variableInfo = variableInfo;
    functionInfo.globals = globalVarNodes.strings();
    functionInfo.isPrototype = strcmp(functionNode.kind, 'PROTO');

    if ~functionInfo.isPrototype
        % Compute function declaration information
        topLevelFunctionNode = functionNode.Fname;
        while strcmp(topLevelFunctionNode.trueparent.kind, 'ETC') % Note: ETC is an extra hidden node, used for grouping
            topLevelFunctionNode = topLevelFunctionNode.trueparent;
        end
        [declLineEnd, declCharEnd] = topLevelFunctionNode.pos2lc(topLevelFunctionNode.righttreepos);
        functionInfo.declaration = createRange(functionInfo.range.lineStart, functionInfo.range.charStart, declLineEnd, declCharEnd);
    end

    if ~isClassDef
        functionInfo.parentClass = '';
    end

    %% Generate function hash
    functionHash = createHash(functionInfo);
    if functionMap.isKey(functionHash)
        % Already have info about this function
        return
    end

    %% Parse dotted identifiers (e.g. a.b.c)
    % Specifically, a.b.c where 'a' is not a variable
    subscripts = body.mtfind('Kind', 'ID'); % Note: Only 'a' is ID, 'b' and 'c' are FIELD
    indices = subscripts.indices;
    dotRoots = [];
    for k = 1:numel(indices)
        id = body.select(indices(k));

        p = id.trueparent;
        if p.kind ~= "DOT"
            continue
        end

        while p.trueparent.kind == "DOT"
            p = p.trueparent;
        end

        dotRoots = [dotRoots p.indices]; %#ok<AGROW>
    end

    dotRoots = unique(dotRoots);

    for k = 1:numel(dotRoots)
        dotRoot = body.select(dotRoots(k));
        id = dotRoot; % Create second variable which will be manipulated

        while id.kind == "DOT"
            id = id.Left;
        end

        baseName = id.string();
        if ~isfield(variableInfo, baseName)
            % a.b.f - where 'a' is not a variable. Assume this is a package function or static method
            % and store it in the top-level references
            callee = dotRoot.tree2str(); % Returns a pretty-printed version of the subtree. Likely "a.b.c"
            range = getRangeForNodes(dotRoot);
            functionReferences{end + 1} = { callee, range }; %#ok<AGROW>
        end
    end

    functionMap(char(functionHash)) = functionInfo;

    %% Recursively call for nested functions
    % Scrounge for nested functions
    statements = functionNode.Body.List;
    nestedFunctions = statements.mtfind('Kind', 'FUNCTION');

    for ind = nestedFunctions.indices
        functionReferences = parseFunctionData(nestedFunctions.select(ind), false, false, '', functionMap, functionReferences);
    end
end

% -------- Helper Functions -------- %

function range = createRange (lineStart, charStart, lineEnd, charEnd)
    if nargin < 4
        range = struct('lineStart', 0, 'charStart', 0, 'lineEnd', 0, 'charEnd', 0);
    else
        % Use num2cell to force 'struct' to create an array of structs, instead of a single struct containing arrays
        range = struct('lineStart', num2cell(lineStart), 'charStart', num2cell(charStart), 'lineEnd', num2cell(lineEnd), 'charEnd', num2cell(charEnd));
    end
end

function memberInfo = createMemberInfo (name, range, parentClass, isPublic)
    % Creates an info object to represent a member (property or function) of the class
    memberInfo = struct('name', name, 'range', range, 'parentClass', parentClass, 'isPublic', isPublic);
end

function range = getRangeForNodes (mtNode)
    % Gets the range (start line/char to end line/char) for the given node.
    [lineStart, charStart] = mtNode.pos2lc(mtNode.lefttreepos);
    [lineEnd, charEnd] = mtNode.pos2lc(mtNode.righttreepos);
    range = createRange(lineStart, charStart, lineEnd, charEnd + 1);
end

function ranges = accumulateRangesForNodes (mtNode, ranges)
    % Gets the range for the given node.
    % If an (optional) array of ranges is provided as well, the resulting
    % value will include the new range concatenated onto the end of the
    % array.
    if nargin == 1
        ranges = [];
    end

    ranges = [ranges; getRangeForNodes(mtNode)];
end

function hash = createHash (functionInfo)
    hash = functionInfo.name + "$"...
        + functionInfo.range.lineStart + "$"...
        + functionInfo.range.charStart + "$"...
        + functionInfo.range.lineEnd + "$"...
        + functionInfo.range.charEnd + "$"...
        + functionInfo.parentClass;

    if isfield(functionInfo, 'declaration')
        hash = hash + "$"...
            + functionInfo.declaration.lineStart + "$"...
            + functionInfo.declaration.charStart + "$"...
            + functionInfo.declaration.lineEnd + "$"...
            + functionInfo.declaration.charEnd;
    end
end

function variableInfo = addVariableDefinitions (variableNodes, variableInfo)
    variableInfo = addVariableInfo(variableNodes, variableInfo, 'definitions');
end

function variableInfo = addVariableReferences (variableNodes, variableInfo)
    variableInfo = addVariableInfo(variableNodes, variableInfo, 'references');
end

function variableInfo = addVariableInfo (variableNodes, variableInfo, field)
    vars = variableNodes.strings();
    ranges = getRangeForNodes(variableNodes);
    variableInfo = addVariableInfoImpl(vars, ranges, variableInfo, field);
end

function variableInfo = addArgumentsInfo (functionNode, variableInfo)
    argsBlock = functionNode.Tree.mtfind('Kind', 'ARGUMENTS').List;
    if argsBlock.count == 0
        return
    end
    argsBlock = argsBlock.Body.List;
    ranges = getRangeForNodes(argsBlock.ArgumentValidation);
    vars = argsBlock.ArgumentValidation.VarName.strings();
    variableInfo = addVariableInfoImpl(vars, ranges, variableInfo, 'definitions');
end

function variableInfo = addVariableInfoImpl (vars, ranges, variableInfo, field)
    info = cell(1, numel(vars));
    for k = 1:numel(vars)
        name = vars{k};
        if isempty(name)
            info{k} = {};
            continue
        end
        info{k} = { name, ranges(k) };
    end
    if ~isfield(variableInfo, field)
        variableInfo.(field) = info;
    else
        variableInfo.(field) = [variableInfo.(field) info];
    end
end
