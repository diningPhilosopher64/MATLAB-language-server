classdef LintingSupportHandler < matlabls.handlers.AbstractFeatureHandler
    % LINTINGSUPPORTHANDLER The feature handler for linting MATLAB code.

    properties (Access = private)
        LintingRequestChannel = '/matlabls/linting/request'
        LintingResponseChannel = '/matlabls/linting/response'

        EndStatementRequestChannel = '/matlabls/linting/endstatement/request'
        EndStatementResponseChannel = '/matlabls/linting/endstatement/response'
    end

    methods
        function this = LintingSupportHandler (commManager)
            this = this@matlabls.handlers.AbstractFeatureHandler(commManager);
            this.RequestSubscriptions(1) = this.CommManager.subscribe(this.LintingRequestChannel, @this.handleLintingRequest);
            this.RequestSubscriptions(2) = this.CommManager.subscribe(this.EndStatementRequestChannel, @this.handleEndStatementRequest);
        end
    end

    methods (Access = private)
        function handleLintingRequest (this, msg)
            % Gathers linting data for the provided code.

            code = msg.code;
            fileName = msg.fileName;

            response.lintData = checkcode('-text', code, fileName, '-id', '-severity', '-fix', '-string');
            response.lintData = split(deblank(response.lintData), newline);
            response.lintData(cellfun(@isempty, response.lintData)) = [];

            this.CommManager.publish(this.LintingResponseChannel, response)
        end

        function handleEndStatementRequest (this, msg)
            % For the provided code, find the last line (1-based) of the
            % statement containing the provided line number (1-based).
            % For example, takes into account line continuations (...).
            %
            % This is used to determine where linting filters ("%#ok<...>")
            % should be inserted.

            code = msg.code;
            lineNumber = msg.lineNumber;

            response.lineNumber = matlabls.helpers.findStatementEndLine(code, lineNumber);

            this.CommManager.publish(this.EndStatementResponseChannel, response)
        end
    end
end
