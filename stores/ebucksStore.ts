// stores/ebucksStore.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

interface EbucksState {
  balance: number;
  isLoading: boolean;
  initialize: () => Promise<void>;
  earnEbucks: (amount: number, reason?: string) => Promise<void>;
  spendEbucks: (amount: number) => Promise<boolean>;
  getBalance: () => number;
  refreshBalance: () => Promise<void>;
}

const EBUCKS_BALANCE_KEY = 'ebucks_balance';
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
  isLoading: true,

  initialize: async () => {
    try {
      set({ isLoading: true });
      
      const userIdentifier = await getUserIdentifier();
      if (!userIdentifier) {
        set({ balance: 0, isLoading: false });
        return;
      }

      // Try to load from database first
      const { data, error } = await supabase
        .from('user_ebucks_balance')
        .select('balance')
        .eq('user_identifier', userIdentifier)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error loading balance from database:', error);
      }

      let balance = 0;
      if (data) {
        balance = data.balance || 0;
      } else {
        // Create initial balance record (use upsert to handle race conditions)
        const [scoutName, teamNumber] = userIdentifier.split(':');
        const { data: upsertData, error: upsertError } = await supabase
          .from('user_ebucks_balance')
          .upsert({
            user_identifier: userIdentifier,
            scout_name: scoutName,
            team_number: teamNumber,
            balance: 0,
            total_earned: 0,
            total_spent: 0,
          }, {
            onConflict: 'user_identifier',
            ignoreDuplicates: false,
          })
          .select('balance')
          .single();

        if (upsertError) {
          // If upsert fails, try to fetch again (might have been created by another process)
          const { data: retryData } = await supabase
            .from('user_ebucks_balance')
            .select('balance')
            .eq('user_identifier', userIdentifier)
            .single();
          
          if (retryData) {
            balance = retryData.balance || 0;
          } else {
            console.error('Error creating/retrieving balance record:', upsertError);
          }
        } else if (upsertData) {
          balance = upsertData.balance || 0;
        }
      }

      // Also sync with AsyncStorage for offline access
      await AsyncStorage.setItem(EBUCKS_BALANCE_KEY, balance.toString());

      set({ balance, isLoading: false });
    } catch (error) {
      console.error('Error initializing ebucks store:', error);
      // Fallback to AsyncStorage
      try {
        const stored = await AsyncStorage.getItem(EBUCKS_BALANCE_KEY);
        const balance = stored ? parseInt(stored, 10) : 0;
        set({ balance, isLoading: false });
      } catch {
        set({ balance: 0, isLoading: false });
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

      const currentBalance = get().balance;
      const newBalance = currentBalance + amount;

      // Update database
      // Get current total_earned first
      const { data: currentData } = await supabase
        .from('user_ebucks_balance')
        .select('total_earned')
        .eq('user_identifier', userIdentifier)
        .single();
      
      const newTotalEarned = (currentData?.total_earned || 0) + amount;
      
      const { error } = await supabase
        .from('user_ebucks_balance')
        .update({
          balance: newBalance,
          total_earned: newTotalEarned,
          updated_at: new Date().toISOString(),
        })
        .eq('user_identifier', userIdentifier);

      if (error) {
        console.error('Error updating balance in database:', error);
      }

      // Update AsyncStorage
      await AsyncStorage.setItem(EBUCKS_BALANCE_KEY, newBalance.toString());

      set({ balance: newBalance });

      console.log(`Earned ${amount} ebucks. New balance: ${newBalance}`, reason ? `Reason: ${reason}` : '');
    } catch (error) {
      console.error('Error earning ebucks:', error);
    }
  },

  spendEbucks: async (amount: number): Promise<boolean> => {
    try {
      const currentBalance = get().balance;
      
      if (currentBalance < amount) {
        return false; // Insufficient balance
      }

      const userIdentifier = await getUserIdentifier();
      if (!userIdentifier) {
        console.warn('Cannot spend ebucks: No user identifier');
        return false;
      }

      const newBalance = currentBalance - amount;

      // Update database
      // Get current total_spent first
      const { data: currentData } = await supabase
        .from('user_ebucks_balance')
        .select('total_spent')
        .eq('user_identifier', userIdentifier)
        .single();
      
      const newTotalSpent = (currentData?.total_spent || 0) + amount;
      
      const { error } = await supabase
        .from('user_ebucks_balance')
        .update({
          balance: newBalance,
          total_spent: newTotalSpent,
          updated_at: new Date().toISOString(),
        })
        .eq('user_identifier', userIdentifier);

      if (error) {
        console.error('Error updating balance in database:', error);
        return false;
      }

      // Update AsyncStorage
      await AsyncStorage.setItem(EBUCKS_BALANCE_KEY, newBalance.toString());

      set({ balance: newBalance });

      return true;
    } catch (error) {
      console.error('Error spending ebucks:', error);
      return false;
    }
  },

  getBalance: () => {
    return get().balance;
  },

  refreshBalance: async () => {
    await get().initialize();
  },
}));

// Export constant for match earnings
export { EARNED_PER_MATCH };
