classdef (Hidden) MatlabLanguageServerHelper < handle
    % MATLABLANGUAGESERVERHELPER Class for managing the MATLAB-side operations
    % which support the MATLAB Language Server.

    properties
        CommManager (1,:) matlabls.helpers.CommunicationManager
        FeatureHandlers = {}
    end

    methods
        function this = MatlabLanguageServerHelper ()
            this.CommManager = matlabls.helpers.CommunicationManager();
            this.initializeFeatureHandlers()
        end

        function close (this)
            cellfun(@(handler) handler.close(), this.FeatureHandlers)
        end

        function delete (this)
            this.close()
        end
    end

    methods (Access = private)
        function initializeFeatureHandlers (this)
            % Initialize all supported feature handlers
            this.FeatureHandlers{end + 1} = matlabls.handlers.FormatSupportHandler(this.CommManager);
            this.FeatureHandlers{end + 1} = matlabls.handlers.LintingSupportHandler(this.CommManager);
        end
    end
end