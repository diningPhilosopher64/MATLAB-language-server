classdef AbstractFeatureHandler < handle
    %ABSTRACTFEATUREHANDLER Serves as the base class for all feature handlers.

    properties
        CommManager (1,:) matlabls.helpers.CommunicationManager
        RequestSubscription
    end

    methods
        function this = AbstractFeatureHandler (commManager)
            this.CommManager = commManager;
        end

        function close (this)
            this.CommManager.unsubscribe(this.RequestSubscription)
        end

        function destroy (this)
            this.close()
        end
    end
end
