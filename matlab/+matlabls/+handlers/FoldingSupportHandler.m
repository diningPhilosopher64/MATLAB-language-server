classdef (Hidden) FoldingSupportHandler < matlabls.handlers.FeatureHandler


    properties (Access = private)
        RequestChannel = "/matlabls/foldDocument/request"
        ResponseChannel = "/matlabls/foldDocument/response"
    end

    methods
        function this = FoldingSupportHandler ()
            this = this@matlabls.handlers.FeatureHandler();
            this.RequestSubscriptions = matlabls.internal.CommunicationManager.subscribe(this.RequestChannel, @this.handleFoldingRequest);
        end
    end

    methods (Access = private)
        function handleFoldingRequest (this, msg)
            % Handles format document requests
            codeToFold = msg.code;
            fRangesArray = [];

            analysisObj = matlabls.internal.analyzeCode(codeToFold);

            fRangesArray = this.getFoldingRanges(analysisObj.CodeStructures, fRangesArray);
            response.data = fRangesArray;

            % Send folding ranges
            responseChannel = strcat(this.ResponseChannel, '/', msg.channelId);
            matlabls.internal.CommunicationManager.publish(responseChannel, response.data)
        end


        function fRangesArray = getFoldingRanges(this, codeStructs, fRangesArray)
            % Handle codeStructs array (multiple code structures)
            for i=1:length(codeStructs)
                % Do not fold blocks that are not foldable in MATLAB
                if(~ismember(codeStructs(i).Type, {'argumentsBlock', 'elseifBlock', 'elseBlock', 'caseSelection', 'otherwiseBlock', 'catchBlock'})) 
                    fRangesArray = [fRangesArray, codeStructs(i).StartLine, codeStructs(i).EndLine];
                end
                % Fold nested structures
                if(~isempty(codeStructs(i).NestedStructures))
                    fRangesArray = this.getFoldingRanges(codeStructs(i).NestedStructures, fRangesArray);
                end
            end
        end
    end
end