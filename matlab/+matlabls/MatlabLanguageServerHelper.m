classdef MatlabLanguageServerHelper < handle
    % Class for managing the MATLAB-side operations which support the MATLAB
    % Language Server.
    properties
        CommManager
        FeatureHandlers = {}
    end

    methods
        function this = MatlabLanguageServerHelper ()
            this.CommManager = matlabls.helpers.CommunicationManager();
            this.initializeFeatureHandlers()
        end

        function close (this)
            for idx = 1:length(this.FeatureHandlers)
                this.FeatureHandlers{idx}.close()
            end
        end

        function delete (this)
            this.close()
        end
    end

    methods (Access = private)
        function initializeFeatureHandlers (this)
            % Initialize all supported feature handlers
            this.FeatureHandlers{end + 1} = matlabls.handlers.FormatSupportHandler(this.CommManager);
        end
    end
end