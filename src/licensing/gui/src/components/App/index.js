// Copyright 2020-2024 The MathWorks, Inc.

import React, { useEffect, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useInterval } from 'react-use';
import Overlay from '../Overlay';
import LicensingGatherer from '../LicensingGatherer';
import Information from '../Information';
import EntitlementSelector from "../EntitlementSelector";
import Error from '../Error';

import {
    selectOverlayVisible,
    selectFetchStatusPeriod,
    selectHasFetchedServerStatus,
    selectLicensingProvided,
    selectIsConnectionError,
    selectHasFetchedEnvConfig,
    selectLicensingMhlmHasEntitlements,
    selectIsEntitled,
    selectLicensingInfo,
    selectError,
    selectAuthEnabled,
    selectIsAuthenticated,
    selectIsInvalidTokenError

} from "../../selectors";

import {
    fetchServerStatus,
    fetchEnvConfig,
    fetchUnsetLicensing,
    updateAuthStatus
} from '../../actionCreators';

import { MWI_AUTH_TOKEN_NAME_FOR_HTTP } from '../../constants';

import './App.css';

function App() {
    const dispatch = useDispatch();

    const overlayVisible = useSelector(selectOverlayVisible);
    const fetchStatusPeriod = useSelector(selectFetchStatusPeriod);
    const hasFetchedServerStatus = useSelector(selectHasFetchedServerStatus);
    const hasFetchedEnvConfig = useSelector(selectHasFetchedEnvConfig);
    const licensingProvided = useSelector(selectLicensingProvided);
    const hasEntitlements = useSelector(selectLicensingMhlmHasEntitlements);
    const isEntitled = useSelector(selectIsEntitled);
    const isConnectionError = useSelector(selectIsConnectionError);
    const licensingInfo = useSelector(selectLicensingInfo);
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const authEnabled = useSelector(selectAuthEnabled);
    const error = useSelector(selectError)
    const isInvalidTokenError = useSelector(selectIsInvalidTokenError)
    
    function handleClick(e) {
        e.preventDefault();
        dispatch(fetchUnsetLicensing())
    }
    let dialog;    
    if (isConnectionError) {
        dialog = (
            <Error message="Server unreachable"> </Error>
        );
    } else if(error && !isInvalidTokenError){
        dialog = (
            <Error message={error.message}> 
                <span onClick={handleClick} style={{ color: 'blue', cursor: 'pointer' }}> Try Licensing again </span>            
            </Error>
        );
    }

    const baseUrl = useMemo(() => {
        const url = document.URL;
        return url.split(window.location.origin)[1].split('index.html')[0];
    }, []);

    const parseQueryParams = (url) => {
        const queryParams = new URLSearchParams(url.search);
        return queryParams;
    };

    useEffect(() => {
        // NOTE: the request for fetching env config is given higher priority
        // because after token auth, the Licensing component is rendered which requires
        // the list of supportedMatlabVersions.
        if(hasFetchedEnvConfig){
            const queryParams = parseQueryParams(window.location);
            const token = queryParams.get(MWI_AUTH_TOKEN_NAME_FOR_HTTP);

            if (token) {
                dispatch(updateAuthStatus(token));
            }
            window.history.replaceState(null, '', `${baseUrl}index.html`);
        }
        
    }, [dispatch, baseUrl, hasFetchedEnvConfig]);
    

    useEffect(() => {
        // Initial fetch environment configuration
        if (!hasFetchedEnvConfig) {
            dispatch(fetchEnvConfig());
        }

    }, [dispatch, hasFetchedEnvConfig]);

    useEffect(() => {
        // Initial fetch server status
        if (hasFetchedEnvConfig && !hasFetchedServerStatus) {
            dispatch(fetchServerStatus());
        }

    }, [dispatch, hasFetchedServerStatus, hasFetchedEnvConfig]);

    // Periodic fetch server status
    useInterval(() => {
        if(hasFetchedServerStatus)
        {
            dispatch(fetchServerStatus());
        }
    }, fetchStatusPeriod);

    let overlayContent, transparent = false;

    if(dialog){
        overlayContent = dialog;
    } else if (authEnabled && !isAuthenticated) {
        overlayContent = (
            <Information> </Information>
        );

    } else if ((!licensingProvided) && hasFetchedServerStatus ) {
        overlayContent = <LicensingGatherer role="licensing" aria-describedby="license-window" />;
    } else if (hasEntitlements && !isEntitled) {
        overlayContent = <EntitlementSelector options={licensingInfo.entitlements} />;
    } else {
        overlayContent = <div> <h1>You have successfully signed in. Please feel free to close this window</h1> </div>
        transparent = true;
    }

    const overlay = overlayVisible ? (
        <Overlay transparent={transparent}>
            {overlayContent}
        </Overlay>
    ) : null;


    return (
         <React.Fragment>
                <div data-testid="app" className="main">
                    {overlay}
                </div>
        </React.Fragment>
    );
}

export default App;
