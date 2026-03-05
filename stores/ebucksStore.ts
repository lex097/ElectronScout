// stores/ebucksStore.ts
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useDemoStore } from '@/stores/demoStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

interface EbucksState {
  /** Real (non-demo) balance */
  balance: number;
  /** Demo mode balance */
  balanceDemo: number;
  isLoading: boolean;
  initialize: () => Promise<void>;
  earnEbucks: (amount: number, reason?: string) => Promise<void>;
  spendEbucks: (amount: number) => Promise<boolean>;
  getBalance: () => number;
  refreshBalance: () => Promise<void>;
}

const EBUCKS_BALANCE_KEY = 'ebucks_balance';
const EBUCKS_BALANCE_DEMO_KEY = 'ebucks_balance_demo';
const EARNED_PER_MATCH = 20;

// Helper to get user identifier
async function getUserIdentifier(): Promise<string | null> {
  try {
    const scoutName = await AsyncStorage.getItem('scout_name');
    const teamNumber = await AsyncStorage.getItem('team_number');
    
    if (!scoutName || !teamNumber) {
      return null;
    }
    
    return `${scoutName}:${teamNumber}`;
  } catch (error) {
    console.error('Error getting user identifier:', error);
    return null;
  }
}

export const useEbucksStore = create<EbucksState>((set, get) => ({
  balance: 0,
  balanceDemo: 0,
  isLoading: true,

  initialize: async () => {
    try {
      set({ isLoading: true });
      
      const userIdentifier = await getUserIdentifier();
      if (!userIdentifier) {
        set({ balance: 0, balanceDemo: 0, isLoading: false });
        return;
      }

      // Try to load from database first
      const { data, error } = await supabase
        .from('user_ebucks_balance')
        .select('balance, balance_demo')
        .eq('user_identifier', userIdentifier)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error loading balance from database:', error);
      }

      let balance = 0;
      let balanceDemo = 0;
      if (data) {
        balance = data.balance ?? 0;
        balanceDemo = data.balance_demo ?? 0;
      } else {
        const teamId = await useAuthStore.getState().getTeamId();
        if (!teamId) {
          set({ balance: 0, balanceDemo: 0, isLoading: false });
          return;
        }
        const [scoutName, teamNumber] = userIdentifier.split(':');
        const { data: upsertData, error: upsertError } = await supabase
          .from('user_ebucks_balance')
          .upsert({
            team_id: teamId,
            user_identifier: userIdentifier,
            scout_name: scoutName,
            team_number: teamNumber,
            balance: 0,
            balance_demo: 0,
            total_earned: 0,
            total_spent: 0,
            total_earned_demo: 0,
            total_spent_demo: 0,
          }, {
            onConflict: 'team_id,user_identifier',
            ignoreDuplicates: false,
          })
          .select('balance, balance_demo')
          .single();

        if (upsertError) {
          // If upsert fails, try to fetch again (might have been created by another process)
          const { data: retryData } = await supabase
            .from('user_ebucks_balance')
            .select('balance, balance_demo')
            .eq('user_identifier', userIdentifier)
            .single();
          
          if (retryData) {
            balance = retryData.balance ?? 0;
            balanceDemo = retryData.balance_demo ?? 0;
          } else {
            console.error('Error creating/retrieving balance record:', upsertError);
          }
        } else if (upsertData) {
          balance = upsertData.balance ?? 0;
          balanceDemo = upsertData.balance_demo ?? 0;
        }
      }

      // Also sync with AsyncStorage for offline access
      await AsyncStorage.setItem(EBUCKS_BALANCE_KEY, balance.toString());
      await AsyncStorage.setItem(EBUCKS_BALANCE_DEMO_KEY, balanceDemo.toString());

      set({ balance, balanceDemo, isLoading: false });
    } catch (error) {
      console.error('Error initializing ebucks store:', error);
      // Fallback to AsyncStorage
      try {
        const [stored, storedDemo] = await Promise.all([
          AsyncStorage.getItem(EBUCKS_BALANCE_KEY),
          AsyncStorage.getItem(EBUCKS_BALANCE_DEMO_KEY),
        ]);
        const balance = stored ? parseInt(stored, 10) : 0;
        const balanceDemo = storedDemo ? parseInt(storedDemo, 10) : 0;
        set({ balance, balanceDemo, isLoading: false });
      } catch {
        set({ balance: 0, balanceDemo: 0, isLoading: false });
      }
    }
  },

  earnEbucks: async (amount: number, reason?: string) => {
    try {
      const userIdentifier = await getUserIdentifier();
      if (!userIdentifier) {
        console.warn('Cannot earn ebucks: No user identifier');
        return;
      }

      const isDemo = useDemoStore.getState().isDemoMode;
      const currentBalance = isDemo ? get().balanceDemo : get().balance;
      const newBalance = currentBalance + amount;

      // Single RPC call (was: 1 SELECT + 1 UPDATE)
      const { error } = await supabase.rpc('increment_earned_ebucks', {
        p_user_identifier: userIdentifier,
        p_amount: amount,
        p_is_demo: isDemo,
      });

      if (error) {
        console.error('Error updating balance in database:', error);
      }

      // Update AsyncStorage and state
      if (isDemo) {
        await AsyncStorage.setItem(EBUCKS_BALANCE_DEMO_KEY, newBalance.toString());
        set({ balanceDemo: newBalance });
      } else {
        await AsyncStorage.setItem(EBUCKS_BALANCE_KEY, newBalance.toString());
        set({ balance: newBalance });
      }

      console.log(`Earned ${amount} ebucks (${isDemo ? 'demo' : 'real'}). New balance: ${newBalance}`, reason ? `Reason: ${reason}` : '');
    } catch (error) {
      console.error('Error earning ebucks:', error);
    }
  },

  spendEbucks: async (amount: number): Promise<boolean> => {
    try {
      const isDemo = useDemoStore.getState().isDemoMode;
      const currentBalance = isDemo ? get().balanceDemo : get().balance;
      
      if (currentBalance < amount) {
        return false; // Insufficient balance
      }

      const userIdentifier = await getUserIdentifier();
      if (!userIdentifier) {
        console.warn('Cannot spend ebucks: No user identifier');
        return false;
      }

      const newBalance = currentBalance - amount;

      // Single RPC call: atomic spend with balance check (was: 1 SELECT + 1 UPDATE)
      const { data: success, error } = await supabase.rpc('spend_ebucks_if_sufficient', {
        p_user_identifier: userIdentifier,
        p_amount: amount,
        p_is_demo: isDemo,
      });

      if (error) {
        console.error('Error spending ebucks:', error);
        return false;
      }

      if (!success) {
        return false; // Insufficient balance in DB (race condition)
      }

      // Update AsyncStorage and state
      if (isDemo) {
        await AsyncStorage.setItem(EBUCKS_BALANCE_DEMO_KEY, newBalance.toString());
        set({ balanceDemo: newBalance });
      } else {
        await AsyncStorage.setItem(EBUCKS_BALANCE_KEY, newBalance.toString());
        set({ balance: newBalance });
      }

      return true;
    } catch (error) {
      console.error('Error spending ebucks:', error);
      return false;
    }
  },

  getBalance: () => {
    const isDemo = useDemoStore.getState().isDemoMode;
    return isDemo ? get().balanceDemo : get().balance;
  },

  refreshBalance: async () => {
    await get().initialize();
  },
}));

/** Hook to get the effective balance for the current mode (demo vs real). Use this for display. */
export function useEffectiveBalance(): number {
  const isDemo = useDemoStore((s) => s.isDemoMode);
  return useEbucksStore((s) => (isDemo ? s.balanceDemo : s.balance));
}

// Export constant for match earnings
export { EARNED_PER_MATCH };
