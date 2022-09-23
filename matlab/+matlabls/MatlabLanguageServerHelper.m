classdef (Hidden) MatlabLanguageServerHelper < handle
    % MATLABLANGUAGESERVERHELPER Class for managing the MATLAB-side operations
    % which support the MATLAB Language Server.

    properties
        CommManager (1,1) matlabls.internal.CommunicationManager
        FeatureHandlers (1,:) matlabls.handlers.FeatureHandler
    end

    methods
        function this = MatlabLanguageServerHelper ()
            this.CommManager = matlabls.internal.CommunicationManager();
            this.initializeFeatureHandlers()
        end

        function close (this)
            arrayfun(@(handler) handler.close(), this.FeatureHandlers)
        end

        function delete (this)
            this.close()
        end
    end

    methods (Access = private)
        function initializeFeatureHandlers (this)
            % Initialize all supported feature handlers
            this.FeatureHandlers(end + 1) = matlabls.handlers.CompletionSupportHandler(this.CommManager);
            this.FeatureHandlers(end + 1) = matlabls.handlers.FormatSupportHandler(this.CommManager);
            this.FeatureHandlers(end + 1) = matlabls.handlers.LintingSupportHandler(this.CommManager);
        end
    end
end
