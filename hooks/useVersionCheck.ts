import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import VersionCheck from 'react-native-version-check';

interface VersionCheckState {
  showModal: boolean;
  storeUrl: string;
  latestVersion: string | undefined;
}

export function useVersionCheck() {
  const [state, setState] = useState<VersionCheckState>({
    showModal: false,
    storeUrl: '',
    latestVersion: undefined,
  });
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const checkForUpdate = useCallback(() => {
    if (__DEV__) return;

    VersionCheck.needUpdate({ ignoreErrors: true })
      .then((res) => {
        if (res.isNeeded && res.storeUrl) {
          setState({
            showModal: true,
            storeUrl: res.storeUrl,
            latestVersion: res.latestVersion,
          });
        }
      })
      .catch(() => {
        // Silently ignore (e.g. network or store parsing errors)
      });
  }, []);

  useEffect(() => {
    checkForUpdate();
  }, [checkForUpdate]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        checkForUpdate();
      }
      appStateRef.current = nextState;
    });
    return () => subscription.remove();
  }, [checkForUpdate]);

  const dismissModal = useCallback(() => {
    setState((prev) => ({ ...prev, showModal: false }));
  }, []);

  return { ...state, dismissModal };
}
