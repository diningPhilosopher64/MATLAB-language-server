% Copyright 2022 - 2023 The MathWorks, Inc.

classdef (Hidden) CommunicationManager < handle
    % COMMUNICATIONMANAGER Class for facilitating communication between the MATLAB Language
    % Server and the MATLAB application.

    % NOTE: This class serves as a passthrough to Message Service APIs
    % and will be obfuscated to hide their usage from end users.

    methods
        function this = CommunicationManager ()
            connector.ensureServiceOn()
        end
    end

    methods (Static)
        function subscription = subscribe(channel, callback)
            % Subscribe to the given channel. When messages are received on that
            % channel, the provided callback function will be called with the message
            % as input.
            % Returns a reference to the active subscription.
            subscription = message.subscribe(channel, callback);
        end

        function unsubscribe (subscription)
            % Unsubscribe from the provided subscription.
            message.unsubscribe(subscription)
        end

        function publish (channel, data)
            % Publish data to the given channel.
            message.publish(channel, data)
        end
    end
end
