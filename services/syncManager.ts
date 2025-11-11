import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { syncManager } from './syncTransformer';

// Initialize auto-sync when app starts
export function initAutoSync() {
  NetInfo.addEventListener((state: NetInfoState) => {
    const isConnected = state.isConnected ?? false;
    
    if (isConnected) {
      console.log('Online - triggering sync');
      
      // Auto-sync in background
      syncManager.fullSync().then(result => {
        console.log(`Auto-sync: ${result.success} uploaded`);
      });
    } else {
      console.log('Offline - sync paused');
    }
  });
}