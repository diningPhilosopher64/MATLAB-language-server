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
    FormatDocument = 'formatDocument',
    GoToReference = 'goToReference',
    GoToDefinition = 'goToDefinition'
}

export enum ActionErrorConditions {
    MatlabUnavailable = 'MATLAB unavailable'
}

function reportTelemetry(eventKey: string, data: unknown): void {
    NotificationService.sendNotification(Notification.LogTelemetryData, {
        eventKey,
        data
    })
}

export function reportTelemetryAction(actionType: string, data = ''): void {
    reportTelemetry(EventKeys.Action, {
        action_type: actionType,
        result: data
    })
}

export function reportTelemetrySettingsChange(settingName: string, newValue: unknown, oldValue: unknown): void {
    reportTelemetry(EventKeys.SettingChange, {
        setting_name: settingName,
        new_value: newValue,
        old_value: oldValue
    })
}
