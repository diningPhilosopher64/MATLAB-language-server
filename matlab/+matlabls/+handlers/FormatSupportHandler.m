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

            % Handle restoring current settings
            names = ["InsertSpaces", "TabSize", "IndentSize"];
            initialValues = cell(1, 3);
            shouldResetTemporaryValues = zeros(1, 3);
            for i = 1:numel(names)
                initialValues{i} = s.matlab.editor.tab.(names(i)).ActiveValue;
                shouldResetTemporaryValues(i) = ~s.matlab.editor.tab.(names(i)).hasTemporaryValue;
            end

            cleanupHandle = onCleanup(@() this.restoreSettings(names, initialValues, shouldResetTemporaryValues));

            % Update settings for formatting
            s.matlab.editor.tab.InsertSpaces.TemporaryValue = msg.insertSpaces;
            s.matlab.editor.tab.TabSize.TemporaryValue = msg.tabSize;
            s.matlab.editor.tab.IndentSize.TemporaryValue = msg.tabSize;

            % Format code
            response.data = indentcode(codeToFormat, 'matlab'); % This will pull from the user's MATLAB settings.

            % Send formatted code
            this.CommManager.publish(this.ResponseChannel, response)
        end

        function restoreSettings (~, names, initialValues, shouldResetTemporaryValues)
            s = settings;
            for i = 1:numel(names)
                if (shouldResetTemporaryValues(i))
                    clearTemporaryValue(s.matlab.editor.tab.(names(i)));
                else
                    s.matlab.editor.tab.(names(i)).TemporaryValue = initialValues{i};
                end
            end
        end
    end
end
