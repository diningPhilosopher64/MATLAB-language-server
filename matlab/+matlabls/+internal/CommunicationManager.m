classdef (Hidden) CommunicationManager < handle
    % COMMUNICATIONMANAGER Class for facilitating communication between the MATLAB® Language
    % Server and the MATLAB application.

    % Copyright 2022 - 2024 The MathWorks, Inc.

    % NOTE: This class serves as a passthrough to Message Service APIs
    % and will be obfuscated to hide their usage from end users.

    methods (Static)
        function initialize ()
            % Ensures the Connector is running
            connector.ensureServiceOn()
        end

        function port = getSecurePort()
            % Gets the connector's secure port number
            port = connector.securePort();
        end

        function certFile = getCertificateLocation()
            % Gets the file location of the Connector's self-signed certificate
            certFile = connector.getCertificateLocation();
        end

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
