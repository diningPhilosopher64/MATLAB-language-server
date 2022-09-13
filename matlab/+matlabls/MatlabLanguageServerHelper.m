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
            % TODO: Add feature handlers here
        end
    end
end