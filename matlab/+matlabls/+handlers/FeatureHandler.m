classdef (Hidden) FeatureHandler < matlab.mixin.Heterogeneous & handle
    %FEATUREHANDLER Serves as the base class for all feature handlers.

    properties
        CommManager (1,1) matlabls.internal.CommunicationManager
        RequestSubscriptions (1,:) uint64 % Holds references to subscriptions
    end

    methods
        function this = FeatureHandler (commManager)
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
