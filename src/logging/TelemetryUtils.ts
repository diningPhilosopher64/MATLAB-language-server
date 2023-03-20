// Copyright 2023 The MathWorks, Inc.

import NotificationService, { Notification } from '../notifications/NotificationService';

enum EventKeys {
    Action = 'ACTIONS',
    SettingChange = 'SETTING_CHANGE'
}

export enum Actions {
    OpenFile = 'openFile',
    StartMatlab = 'startMATLAB',
    ShutdownMatlab = 'shutdownMATLAB',
    FormatDocument = 'formatDocument'
}

function reportTelemetry(eventKey: string, data: unknown): void {
    NotificationService.sendNotification(Notification.LogTelemetryData, {
        eventKey,
        data
    })
}

export function reportTelemetryAction(actionType: string, data: string = ''): void {
    reportTelemetry(EventKeys.Action, {
        action_type: actionType,
        result: data
    })
}
