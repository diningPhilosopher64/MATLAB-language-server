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

            s = settings;

            % Cache current settings
            oldInsertSpaces = s.matlab.editor.tab.InsertSpaces.ActiveValue;
            oldTabSize = s.matlab.editor.tab.TabSize.ActiveValue;
            oldIndentSize = s.matlab.editor.tab.IndentSize.ActiveValue;

            % Update settings
            s.matlab.editor.tab.InsertSpaces.TemporaryValue = msg.insertSpaces;
            s.matlab.editor.tab.TabSize.TemporaryValue = msg.tabSize;
            s.matlab.editor.tab.IndentSize.TemporaryValue = msg.indentSize;

            % Format code
            response.data = indentcode(codeToFormat, 'matlab'); % This will pull from the user's MATLAB settings.

            % Reset settings
            s.matlab.editor.tab.InsertSpaces.TemporaryValue = oldInsertSpaces;
            s.matlab.editor.tab.TabSize.TemporaryValue = oldTabSize;
            s.matlab.editor.tab.IndentSize.TemporaryValue = oldIndentSize;

            % Send formatted code
            this.CommManager.publish(this.ResponseChannel, response)
        end
    end
end
