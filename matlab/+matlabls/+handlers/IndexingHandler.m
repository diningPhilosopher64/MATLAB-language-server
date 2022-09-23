classdef (Hidden) IndexingHandler < matlabls.handlers.FeatureHandler
    % INDEXINGHANDLER The feature handler for indexing documents for variable,
    % function, and class references and definitions.

    properties (Access = private)
        RequestChannel = '/matlabls/indexDocument/request'
        ResponseChannel = '/matlabls/indexDocument/response'
    end

    methods
        function this = IndexingHandler (commManager)
            this = this@matlabls.handlers.FeatureHandler(commManager);
            this.RequestSubscriptions = this.CommManager.subscribe(this.RequestChannel, @this.handleIndexRequest);
        end
    end

    methods (Access = private)
        function handleIndexRequest (this, msg)
            % Indexes an individual document and provides the raw data.

            code = msg.code;
            filePath = msg.filePath;

            codeData = matlabls.internal.computeCodeData(code, filePath);
            this.CommManager.publish(this.ResponseChannel, codeData)
        end
    end
end
