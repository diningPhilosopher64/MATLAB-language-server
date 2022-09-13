classdef (Hidden) FormatSupportHandler < matlabls.handlers.FeatureHandler
    % FORMATSUPPORTHANDLER The feature handler for the "Format Document" feature.
    % In the future, this may be expanded to include the "Format Selection" feature as well.

    properties (Access = private)
        RequestChannel = "/matlabls/formatDocument/request"
        ResponseChannel = "/matlabls/formatDocument/response"
    end

    methods
        function this = FormatSupportHandler (commManager)
            this = this@matlabls.handlers.FeatureHandler(commManager);
            this.RequestSubscriptions = this.CommManager.subscribe(this.RequestChannel, @this.handleFormatRequest);
        end
    end

    methods (Access = private)
        function handleFormatRequest (this, msg)
            % Handles format document requests
            codeToFormat = msg.data;
            response.data = indentcode(codeToFormat, 'matlab');
            this.CommManager.publish(this.ResponseChannel, response)
        end
    end
end
