// components/betting/BettingModal.tsx
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TBAMatch } from '../../api/types';
import { bettingService, BetData, MatchOdds } from '../../services/bettingService';
import { useEbucksStore } from '../../stores/ebucksStore';

interface BettingModalProps {
  visible: boolean;
  onClose: () => void;
  match: TBAMatch;
  eventKey: string;
}

type BetTab = 'winner' | 'margin' | 'over_under' | 'parlay';

export default function BettingModal({ visible, onClose, match, eventKey }: BettingModalProps) {
  const [activeTab, setActiveTab] = useState<BetTab>('winner');
  const [isLoadingOdds, setIsLoadingOdds] = useState(true);
  const [odds, setOdds] = useState<MatchOdds | null>(null);
  const [betAmount, setBetAmount] = useState('');
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  
  // Winner bet state
  const [selectedAlliance, setSelectedAlliance] = useState<'red' | 'blue' | null>(null);
  
  // Margin bet state
  const [selectedMargin, setSelectedMargin] = useState<number | null>(null);
  
  // Over/Under bet state
  const [selectedThreshold, setSelectedThreshold] = useState<number | null>(null);
  const [overUnder, setOverUnder] = useState<'over' | 'under' | null>(null);
  
  // Parlay bet state
  const [parlayBets, setParlayBets] = useState<Array<{
    type: 'winner' | 'margin' | 'over_under';
    details: any;
    odds: number;
  }>>([]);

  const balance = useEbucksStore((state) => state.balance);
  const spendEbucks = useEbucksStore((state) => state.spendEbucks);
  const refreshBalance = useEbucksStore((state) => state.refreshBalance);

  const redTeams = match.alliances.red.team_keys.map((key) => parseInt(key.replace('frc', ''), 10));
  const blueTeams = match.alliances.blue.team_keys.map((key) => parseInt(key.replace('frc', ''), 10));

  // Load odds when modal opens
  useEffect(() => {
    if (visible) {
      loadOdds();
    } else {
      // Reset state when closing
      setActiveTab('winner');
      setBetAmount('');
      setSelectedAlliance(null);
      setSelectedMargin(null);
      setSelectedThreshold(null);
      setOverUnder(null);
      setParlayBets([]);
    }
  }, [visible]);

  const loadOdds = async () => {
    setIsLoadingOdds(true);
    try {
      const matchOdds = await bettingService.calculateMatchOdds(redTeams, blueTeams, eventKey);
      setOdds(matchOdds);
    } catch (error) {
      console.error('Error loading odds:', error);
      Alert.alert('Error', 'Failed to load betting odds');
    } finally {
      setIsLoadingOdds(false);
    }
  };

  // Calculate dynamic margin options
  const marginOptions = useMemo(() => {
    if (!odds) return [];
    
    const expectedMargin = odds.expectedMargin;
    const margins: number[] = [];
    
    // Generate margins around expected margin
    if (expectedMargin > 0) {
      margins.push(Math.max(3, Math.floor(expectedMargin * 0.5)));
      margins.push(Math.max(5, Math.floor(expectedMargin * 0.75)));
      margins.push(Math.max(5, Math.floor(expectedMargin)));
      margins.push(Math.ceil(expectedMargin * 1.25));
      margins.push(Math.ceil(expectedMargin * 1.5));
    } else {
      // Default margins if no data
      margins.push(3, 5, 10, 15, 20);
    }
    
    // Remove duplicates and sort
    return [...new Set(margins)].sort((a, b) => a - b);
  }, [odds]);

  // Calculate over/under thresholds
  const overUnderThresholds = useMemo(() => {
    if (!odds) return [];
    
    if (odds.leagueAverage && odds.leagueAverage.isActive && odds.leagueAverage.avgMatchScore) {
      const leagueTotal = (odds.leagueAverage.avgMatchScore || 0) * 2;
      return [
        Math.round(leagueTotal - 20),
        Math.round(leagueTotal - 10),
        Math.round(leagueTotal),
        Math.round(leagueTotal + 10),
        Math.round(leagueTotal + 20),
      ];
    } else {
      // Fixed thresholds
      return [70, 80, 90, 100, 110];
    }
  }, [odds]);

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.7) return '#10b981'; // Green
    if (confidence >= 0.4) return '#f59e0b'; // Yellow
    return '#6b7280'; // Gray
  };

  const handlePlaceBet = async () => {
    const amount = parseInt(betAmount, 10);
    
    if (!amount || amount < 5) {
      Alert.alert('Invalid Bet', 'Minimum bet is 5 ebucks');
      return;
    }

    if (amount > balance) {
      Alert.alert('Insufficient Balance', `You have ${balance} ebucks. Need ${amount} ebucks.`);
      return;
    }

    setIsPlacingBet(true);

    try {
      let betData: BetData | null = null;
      let betOdds = 1.0;

      switch (activeTab) {
        case 'winner':
          if (!selectedAlliance || !odds) {
            Alert.alert('Invalid Bet', 'Please select an alliance');
            setIsPlacingBet(false);
            return;
          }
          betOdds = selectedAlliance === 'red' ? odds.redOdds : odds.blueOdds;
          betData = {
            matchKey: match.key,
            matchNumber: match.match_number,
            eventKey,
            betType: 'winner',
            betDetails: { alliance: selectedAlliance },
            betAmount: amount,
            odds: betOdds,
            potentialPayout: Math.round(amount * betOdds),
          };
          break;

        case 'margin':
          if (selectedMargin === null || !odds) {
            Alert.alert('Invalid Bet', 'Please select a margin');
            setIsPlacingBet(false);
            return;
          }
          betOdds = bettingService.calculateMarginOdds(odds.expectedMargin, selectedMargin, odds.matchConfidence);
          betData = {
            matchKey: match.key,
            matchNumber: match.match_number,
            eventKey,
            betType: 'margin',
            betDetails: { margin: selectedMargin },
            betAmount: amount,
            odds: betOdds,
            potentialPayout: Math.round(amount * betOdds),
          };
          break;

        case 'over_under':
          if (selectedThreshold === null || !overUnder || !odds) {
            Alert.alert('Invalid Bet', 'Please select a threshold and over/under');
            setIsPlacingBet(false);
            return;
          }
          betOdds = bettingService.calculateOverUnderOdds(
            odds.expectedTotal,
            selectedThreshold,
            odds.matchConfidence,
            odds.leagueAverage
          );
          betData = {
            matchKey: match.key,
            matchNumber: match.match_number,
            eventKey,
            betType: 'over_under',
            betDetails: { threshold: selectedThreshold, overUnder },
            betAmount: amount,
            odds: betOdds,
            potentialPayout: Math.round(amount * betOdds),
          };
          break;

        case 'parlay':
          if (parlayBets.length < 2) {
            Alert.alert('Invalid Parlay', 'Select at least 2 bets for a parlay');
            setIsPlacingBet(false);
            return;
          }
          betOdds = parlayBets.reduce((acc, bet) => acc * bet.odds, 1);
          betData = {
            matchKey: match.key,
            matchNumber: match.match_number,
            eventKey,
            betType: 'parlay',
            betDetails: { parlayBets },
            betAmount: amount,
            odds: betOdds,
            potentialPayout: Math.round(amount * betOdds),
          };
          break;
      }

      if (!betData) {
        setIsPlacingBet(false);
        return;
      }

      // Deduct ebucks
      const success = await spendEbucks(amount);
      if (!success) {
        Alert.alert('Error', 'Failed to deduct ebucks');
        setIsPlacingBet(false);
        return;
      }

      // Place bet
      const betId = await bettingService.placeBet(betData);
      if (!betId) {
        // Refund ebucks if bet placement failed
        const earnEbucks = useEbucksStore.getState().earnEbucks;
        await earnEbucks(amount, 'Refund');
        Alert.alert('Error', 'Failed to place bet');
        setIsPlacingBet(false);
        return;
      }

      Alert.alert('Bet Placed!', `Your bet of ${amount} ebucks has been placed. Potential payout: ${betData.potentialPayout} ebucks.`);
      
      // Refresh balance
      await refreshBalance();
      
      // Reset form
      setBetAmount('');
      setSelectedAlliance(null);
      setSelectedMargin(null);
      setSelectedThreshold(null);
      setOverUnder(null);
      setParlayBets([]);
    } catch (error) {
      console.error('Error placing bet:', error);
      Alert.alert('Error', 'Failed to place bet');
    } finally {
      setIsPlacingBet(false);
    }
  };

  const addParlayBet = (type: 'winner' | 'margin' | 'over_under', details: any, odds: number) => {
    const existingIndex = parlayBets.findIndex(b => b.type === type);
    if (existingIndex >= 0) {
      // Replace existing bet of same type
      const newBets = [...parlayBets];
      newBets[existingIndex] = { type, details, odds };
      setParlayBets(newBets);
    } else {
      // Add new bet
      setParlayBets([...parlayBets, { type, details, odds }]);
    }
  };

  const removeParlayBet = (type: 'winner' | 'margin' | 'over_under') => {
    setParlayBets(parlayBets.filter(b => b.type !== type));
  };

  const renderWinnerTab = () => {
    if (!odds) return null;

    return (
      <View style={styles.tabContent}>
        <Text style={styles.sectionTitle}>Select Winning Alliance</Text>
        
        {/* Red Alliance */}
        <TouchableOpacity
          style={[
            styles.allianceCard,
            selectedAlliance === 'red' && styles.allianceCardSelected,
          ]}
          onPress={() => setSelectedAlliance('red')}
        >
          <View style={styles.allianceHeader}>
            <Text style={styles.allianceLabel}>Red Alliance</Text>
            <View style={styles.oddsBadge}>
              <Text style={styles.oddsText}>{odds.redOdds.toFixed(2)}x</Text>
            </View>
          </View>
          <Text style={styles.allianceTeams}>
            {redTeams.join(', ')}
          </Text>
          <View style={styles.confidenceBar}>
            <View
              style={[
                styles.confidenceFill,
                {
                  width: `${odds.redWinProbability * 100}%`,
                  backgroundColor: getConfidenceColor(odds.matchConfidence),
                },
              ]}
            />
            <Text style={styles.confidenceText}>
              {Math.round(odds.redWinProbability * 100)}% win probability
            </Text>
          </View>
        </TouchableOpacity>

        {/* Blue Alliance */}
        <TouchableOpacity
          style={[
            styles.allianceCard,
            selectedAlliance === 'blue' && styles.allianceCardSelected,
          ]}
          onPress={() => setSelectedAlliance('blue')}
        >
          <View style={styles.allianceHeader}>
            <Text style={styles.allianceLabel}>Blue Alliance</Text>
            <View style={styles.oddsBadge}>
              <Text style={styles.oddsText}>{odds.blueOdds.toFixed(2)}x</Text>
            </View>
          </View>
          <Text style={styles.allianceTeams}>
            {blueTeams.join(', ')}
          </Text>
          <View style={styles.confidenceBar}>
            <View
              style={[
                styles.confidenceFill,
                {
                  width: `${odds.blueWinProbability * 100}%`,
                  backgroundColor: getConfidenceColor(odds.matchConfidence),
                },
              ]}
            />
            <Text style={styles.confidenceText}>
              {Math.round(odds.blueWinProbability * 100)}% win probability
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const renderMarginTab = () => {
    if (!odds) return null;

    return (
      <View style={styles.tabContent}>
        <Text style={styles.sectionTitle}>Red Wins By Margin</Text>
        <Text style={styles.sectionSubtitle}>
          Expected margin: {odds.expectedMargin.toFixed(1)} points
        </Text>

        <View style={styles.marginOptions}>
          {marginOptions.map((margin) => {
            const marginOdds = bettingService.calculateMarginOdds(
              odds.expectedMargin,
              margin,
              odds.matchConfidence
            );
            const isSelected = selectedMargin === margin;

            return (
              <TouchableOpacity
                key={margin}
                style={[styles.marginOption, isSelected && styles.marginOptionSelected]}
                onPress={() => setSelectedMargin(margin)}
              >
                <Text style={styles.marginOptionText}>{margin}+ points</Text>
                <Text style={styles.marginOptionOdds}>{marginOdds.toFixed(2)}x</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const renderOverUnderTab = () => {
    if (!odds) return null;

    return (
      <View style={styles.tabContent}>
        <Text style={styles.sectionTitle}>Total Score</Text>
        <Text style={styles.sectionSubtitle}>
          Expected total: {odds.expectedTotal.toFixed(1)} points
        </Text>

        <View style={styles.overUnderToggle}>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              overUnder === 'over' && styles.toggleButtonActive,
            ]}
            onPress={() => setOverUnder('over')}
          >
            <Text
              style={[
                styles.toggleButtonText,
                overUnder === 'over' && styles.toggleButtonTextActive,
              ]}
            >
              Over
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              overUnder === 'under' && styles.toggleButtonActive,
            ]}
            onPress={() => setOverUnder('under')}
          >
            <Text
              style={[
                styles.toggleButtonText,
                overUnder === 'under' && styles.toggleButtonTextActive,
              ]}
            >
              Under
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.thresholdOptions}>
          {overUnderThresholds.map((threshold) => {
            const thresholdOdds = bettingService.calculateOverUnderOdds(
              odds.expectedTotal,
              threshold,
              odds.matchConfidence,
              odds.leagueAverage
            );
            const isSelected = selectedThreshold === threshold;

            return (
              <TouchableOpacity
                key={threshold}
                style={[
                  styles.thresholdOption,
                  isSelected && styles.thresholdOptionSelected,
                ]}
                onPress={() => setSelectedThreshold(threshold)}
              >
                <Text style={styles.thresholdOptionText}>{threshold}</Text>
                <Text style={styles.thresholdOptionOdds}>{thresholdOdds.toFixed(2)}x</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const renderParlayTab = () => {
    if (!odds) return null;

    const parlayOdds = parlayBets.length > 0
      ? parlayBets.reduce((acc, bet) => acc * bet.odds, 1)
      : 1.0;

    return (
      <View style={styles.tabContent}>
        <Text style={styles.sectionTitle}>Parlay Bets</Text>
        <Text style={styles.sectionSubtitle}>
          Combine multiple bets for higher odds
        </Text>

        {/* Winner bet option */}
        <View style={styles.parlayOption}>
          <View style={styles.parlayOptionHeader}>
            <Text style={styles.parlayOptionTitle}>Winner</Text>
            {parlayBets.find(b => b.type === 'winner') ? (
              <TouchableOpacity
                style={styles.removeParlayButton}
                onPress={() => removeParlayBet('winner')}
              >
                <Ionicons name="close-circle" size={20} color="#ef4444" />
              </TouchableOpacity>
            ) : (
              <View style={styles.parlayButtons}>
                <TouchableOpacity
                  style={styles.parlaySelectButton}
                  onPress={() => {
                    setSelectedAlliance('red');
                    addParlayBet('winner', { alliance: 'red' }, odds.redOdds);
                  }}
                >
                  <Text style={styles.parlaySelectText}>Red ({odds.redOdds.toFixed(2)}x)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.parlaySelectButton}
                  onPress={() => {
                    setSelectedAlliance('blue');
                    addParlayBet('winner', { alliance: 'blue' }, odds.blueOdds);
                  }}
                >
                  <Text style={styles.parlaySelectText}>Blue ({odds.blueOdds.toFixed(2)}x)</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Margin bet option */}
        <View style={styles.parlayOption}>
          <View style={styles.parlayOptionHeader}>
            <Text style={styles.parlayOptionTitle}>Margin</Text>
            {parlayBets.find(b => b.type === 'margin') ? (
              <TouchableOpacity
                style={styles.removeParlayButton}
                onPress={() => removeParlayBet('margin')}
              >
                <Ionicons name="close-circle" size={20} color="#ef4444" />
              </TouchableOpacity>
            ) : (
              <View style={styles.marginOptions}>
                {marginOptions.slice(0, 3).map((margin) => {
                  const marginOdds = bettingService.calculateMarginOdds(
                    odds.expectedMargin,
                    margin,
                    odds.matchConfidence
                  );
                  return (
                    <TouchableOpacity
                      key={margin}
                      style={styles.parlaySelectButton}
                      onPress={() => {
                        setSelectedMargin(margin);
                        addParlayBet('margin', { margin }, marginOdds);
                      }}
                    >
                      <Text style={styles.parlaySelectText}>
                        {margin}+ ({marginOdds.toFixed(2)}x)
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </View>

        {/* Over/Under bet option */}
        <View style={styles.parlayOption}>
          <View style={styles.parlayOptionHeader}>
            <Text style={styles.parlayOptionTitle}>Over/Under</Text>
            {parlayBets.find(b => b.type === 'over_under') ? (
              <TouchableOpacity
                style={styles.removeParlayButton}
                onPress={() => removeParlayBet('over_under')}
              >
                <Ionicons name="close-circle" size={20} color="#ef4444" />
              </TouchableOpacity>
            ) : (
              <View style={styles.thresholdOptions}>
                {overUnderThresholds.slice(0, 3).map((threshold) => {
                  const thresholdOdds = bettingService.calculateOverUnderOdds(
                    odds.expectedTotal,
                    threshold,
                    odds.matchConfidence,
                    odds.leagueAverage
                  );
                  return (
                    <TouchableOpacity
                      key={threshold}
                      style={styles.parlaySelectButton}
                      onPress={() => {
                        setSelectedThreshold(threshold);
                        setOverUnder('over');
                        addParlayBet('over_under', { threshold, overUnder: 'over' }, thresholdOdds);
                      }}
                    >
                      <Text style={styles.parlaySelectText}>
                        Over {threshold} ({thresholdOdds.toFixed(2)}x)
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </View>

        {parlayBets.length > 0 && (
          <View style={styles.parlaySummary}>
            <Text style={styles.parlaySummaryTitle}>Parlay Summary</Text>
            {parlayBets.map((bet, index) => (
              <Text key={index} style={styles.parlaySummaryItem}>
                {bet.type}: {bet.odds.toFixed(2)}x
              </Text>
            ))}
            <Text style={styles.parlaySummaryOdds}>
              Combined Odds: {parlayOdds.toFixed(2)}x
            </Text>
          </View>
        )}
      </View>
    );
  };

  const calculatePotentialPayout = (): number => {
    if (!betAmount || !odds) return 0;
    const amount = parseInt(betAmount, 10);
    if (!amount) return 0;

    let betOdds = 1.0;

    switch (activeTab) {
      case 'winner':
        if (selectedAlliance === 'red') betOdds = odds.redOdds;
        else if (selectedAlliance === 'blue') betOdds = odds.blueOdds;
        break;
      case 'margin':
        if (selectedMargin !== null) {
          betOdds = bettingService.calculateMarginOdds(
            odds.expectedMargin,
            selectedMargin,
            odds.matchConfidence
          );
        }
        break;
      case 'over_under':
        if (selectedThreshold !== null) {
          betOdds = bettingService.calculateOverUnderOdds(
            odds.expectedTotal,
            selectedThreshold,
            odds.matchConfidence,
            odds.leagueAverage
          );
        }
        break;
      case 'parlay':
        if (parlayBets.length > 0) {
          betOdds = parlayBets.reduce((acc, bet) => acc * bet.odds, 1);
        }
        break;
    }

    return Math.round(amount * betOdds);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>Match {match.match_number}</Text>
            <Text style={styles.headerSubtitle}>Place Your Bets</Text>
          </View>
          <View style={styles.balanceBadge}>
            <Text style={styles.balanceText}>{balance} ebucks</Text>
          </View>
        </View>

        {isLoadingOdds ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ff6600" />
            <Text style={styles.loadingText}>Calculating odds...</Text>
          </View>
        ) : (
          <>
            {/* Tabs */}
            <View style={styles.tabs}>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'winner' && styles.tabActive]}
                onPress={() => setActiveTab('winner')}
              >
                <Text style={[styles.tabText, activeTab === 'winner' && styles.tabTextActive]}>
                  Win/Lose
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'margin' && styles.tabActive]}
                onPress={() => setActiveTab('margin')}
              >
                <Text style={[styles.tabText, activeTab === 'margin' && styles.tabTextActive]}>
                  Margin
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'over_under' && styles.tabActive]}
                onPress={() => setActiveTab('over_under')}
              >
                <Text style={[styles.tabText, activeTab === 'over_under' && styles.tabTextActive]}>
                  Over/Under
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === 'parlay' && styles.tabActive]}
                onPress={() => setActiveTab('parlay')}
              >
                <Text style={[styles.tabText, activeTab === 'parlay' && styles.tabTextActive]}>
                  Parlay
                </Text>
              </TouchableOpacity>
            </View>

            {/* Tab Content */}
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
              {activeTab === 'winner' && renderWinnerTab()}
              {activeTab === 'margin' && renderMarginTab()}
              {activeTab === 'over_under' && renderOverUnderTab()}
              {activeTab === 'parlay' && renderParlayTab()}

              {/* Bet Amount Input */}
              <View style={styles.betAmountSection}>
                <Text style={styles.betAmountLabel}>Bet Amount</Text>
                <TextInput
                  style={styles.betAmountInput}
                  value={betAmount}
                  onChangeText={setBetAmount}
                  keyboardType="number-pad"
                  placeholder="Enter amount"
                  placeholderTextColor="#888"
                />
                {betAmount && parseInt(betAmount, 10) > 0 && (
                  <Text style={styles.payoutText}>
                    Potential Payout: {calculatePotentialPayout()} ebucks
                  </Text>
                )}
              </View>
            </ScrollView>

            {/* Place Bet Button */}
            <View style={styles.footer}>
              <TouchableOpacity
                style={[
                  styles.placeBetButton,
                  isPlacingBet && styles.placeBetButtonDisabled,
                ]}
                onPress={handlePlaceBet}
                disabled={isPlacingBet}
              >
                {isPlacingBet ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.placeBetButtonText}>Place Bet</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    backgroundColor: '#ff6600',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    padding: 4,
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 2,
  },
  balanceBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  balanceText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#b0b0b0',
    fontSize: 16,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: '#404040',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#ff6600',
  },
  tabText: {
    color: '#b0b0b0',
    fontSize: 14,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#ff6600',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  tabContent: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#b0b0b0',
    marginBottom: 16,
  },
  allianceCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  allianceCardSelected: {
    borderColor: '#ff6600',
  },
  allianceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  allianceLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  oddsBadge: {
    backgroundColor: '#ff6600',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  oddsText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  allianceTeams: {
    fontSize: 14,
    color: '#b0b0b0',
    marginBottom: 8,
  },
  confidenceBar: {
    height: 24,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  confidenceFill: {
    height: '100%',
    borderRadius: 12,
  },
  confidenceText: {
    position: 'absolute',
    left: 8,
    top: 4,
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  marginOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  marginOption: {
    backgroundColor: '#2a2a2a',
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    minWidth: 100,
    alignItems: 'center',
  },
  marginOptionSelected: {
    borderColor: '#ff6600',
  },
  marginOptionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  marginOptionOdds: {
    color: '#ff6600',
    fontSize: 12,
    fontWeight: '600',
  },
  overUnderToggle: {
    flexDirection: 'row',
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  toggleButtonActive: {
    backgroundColor: '#ff6600',
  },
  toggleButtonText: {
    color: '#b0b0b0',
    fontSize: 14,
    fontWeight: '500',
  },
  toggleButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  thresholdOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  thresholdOption: {
    backgroundColor: '#2a2a2a',
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    minWidth: 80,
    alignItems: 'center',
  },
  thresholdOptionSelected: {
    borderColor: '#ff6600',
  },
  thresholdOptionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  thresholdOptionOdds: {
    color: '#ff6600',
    fontSize: 12,
    fontWeight: '600',
  },
  parlayOption: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  parlayOptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  parlayOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  parlayButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  parlaySelectButton: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#404040',
  },
  parlaySelectText: {
    color: '#fff',
    fontSize: 12,
  },
  removeParlayButton: {
    padding: 4,
  },
  parlaySummary: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  parlaySummaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  parlaySummaryItem: {
    fontSize: 14,
    color: '#b0b0b0',
    marginBottom: 4,
  },
  parlaySummaryOdds: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ff6600',
    marginTop: 8,
  },
  betAmountSection: {
    marginTop: 16,
    marginBottom: 16,
  },
  betAmountLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  betAmountInput: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#404040',
  },
  payoutText: {
    fontSize: 14,
    color: '#10b981',
    marginTop: 8,
    fontWeight: '600',
  },
  footer: {
    padding: 16,
    backgroundColor: '#1a1a1a',
    borderTopWidth: 1,
    borderTopColor: '#404040',
  },
  placeBetButton: {
    backgroundColor: '#ff6600',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  placeBetButtonDisabled: {
    opacity: 0.6,
  },
  placeBetButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
