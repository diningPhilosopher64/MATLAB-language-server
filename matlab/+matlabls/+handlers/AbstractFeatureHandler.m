classdef (Hidden) AbstractFeatureHandler < handle
    %ABSTRACTFEATUREHANDLER Serves as the base class for all feature handlers.

    properties
        CommManager (1,1) matlabls.helpers.CommunicationManager
        RequestSubscriptions (1,:) uint64 % Holds references to subscriptions
    end

    methods
        function this = AbstractFeatureHandler (commManager)
            this.CommManager = commManager;
        end

        function close (this)
            arrayfun(@(subRef) this.CommManager.unsubscribe(subRef), this.RequestSubscriptions)
        end

        function destroy (this)
            this.close()
        end
    end
end
