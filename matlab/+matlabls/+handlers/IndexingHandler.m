classdef (Hidden) IndexingHandler < matlabls.handlers.FeatureHandler
    % INDEXINGHANDLER The feature handler for indexing documents for variable,
    % function, and class references and definitions.

    properties (Access = private)
        DocumentIndexingRequestChannel = '/matlabls/indexDocument/request'
        DocumentIndexingResponseChannel = '/matlabls/indexDocument/response'

        WorkspaceIndexingRequestChannel = '/matlabls/indexWorkspace/request'
        WorkspaceIndexingResponseChannel = '/matlabls/indexWorkspace/response/' % Needs to be appended with requestId

        IdentifierDefinitionRequestChannel = '/matlabls/findIdentifierDefinition/request'
        IdentifierDefinitionResponseChannel = '/matlabls/findIdentifierDefinition/response'
    end

    methods
        function this = IndexingHandler (commManager)
            this = this@matlabls.handlers.FeatureHandler(commManager);
            this.RequestSubscriptions(end + 1) = this.CommManager.subscribe(this.DocumentIndexingRequestChannel, @this.handleDocumentIndexRequest);
            this.RequestSubscriptions(end + 1) = this.CommManager.subscribe(this.WorkspaceIndexingRequestChannel, @this.handleWorkspaceIndexRequest);
            this.RequestSubscriptions(end + 1) = this.CommManager.subscribe(this.IdentifierDefinitionRequestChannel, @this.handleIdentifierDefinitionRequest);
        end
    end

    methods (Access = private)
        function handleDocumentIndexRequest (this, msg)
            % Indexes an individual document and provides the raw data.

            code = msg.code;
            filePath = msg.filePath;

            codeData = matlabls.internal.computeCodeData(code, filePath);
            this.CommManager.publish(this.DocumentIndexingResponseChannel, codeData)
        end

        function handleWorkspaceIndexRequest (this, msg)
            % Indexes the provided workspace folders

            folders = msg.folders;
            requestId = num2str(msg.requestId);

            files = this.getAllMFilesToIndex(folders);
            this.parseFiles(requestId, files)
        end

        function handleIdentifierDefinitionRequest (this, msg)
            % Tries to determine where the provided identifier is defined, from 
            % the context of the given file.

            containingFile = msg.containingFile;
            identifierList = msg.identifiers;

            res = struct(identifier = {}, fileInfo = {});

            for n = 1:length(identifierList)
                identifier = identifierList{n};
                fileInfo = matlabls.helpers.whichHelper(containingFile, identifier);
                if ~isempty(fileInfo)
                    res(end + 1) = struct(identifier = identifier, fileInfo = fileInfo); %#ok<AGROW> 
                end
            end

            this.CommManager.publish(this.IdentifierDefinitionResponseChannel, res)
        end

        function filesToIndex = getAllMFilesToIndex (~, folders)
            % Gathers a list of all M files within the given folders.

            filesToIndex = [];

            for n = 1:length(folders)
                fileListing = dir([folders{n} '/**/*.m']);
                fileNames = strings(length(fileListing), 1);
                for m = 1:length(fileListing)
                    fileNames(m) = string([fileListing(m).folder filesep fileListing(m).name]);
                end
                filesToIndex = [filesToIndex; fileNames]; %#ok<AGROW> 
            end
        end

        function parseFiles (this, requestId, files, index)
            % Parses the given list of files and sends the data back to the language server.
            % This leverages a timer to achieve an "asynchronous" looping effect, allowing
            % other operations to take place between parsing each file. This prevents the MATLAB
            % thread from becomming blocked for an extended period of time. 

            if nargin == 3
                index = 1;
            end

            filePath = files(index);

            code = fileread(filePath);
            codeData = matlabls.internal.computeCodeData(code, filePath);

            % Send data for this file
            msg.filePath = filePath;
            msg.codeData = codeData;

            if index == length(files)
                msg.isDone = true;
            else
                msg.isDone = false;
            end

            responseChannel = [this.WorkspaceIndexingResponseChannel requestId];
            this.CommManager.publish(responseChannel, msg)

            if ~msg.isDone
                % More files - queue next file to parse
                t = timer(TimerFcn = @timerCallback, StartDelay = 0.001); % Use a timer to avoid blocking the MATLAB thread for an extended period of time
                t.start()
            end

            function timerCallback (t, ~)
                % Destroy existing timer
                t.stop()
                t.delete()

                % Parse next file
                this.parseFiles(requestId, files, index + 1)
            end
        end
    end
end
