// components/betting/BettingModal.tsx
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { TBAMatch } from '../../api/types';
import { BetData, bettingService, MatchOdds } from '../../services/bettingService';
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
  const insets = useSafeAreaInsets();
  
  // Winner bet state
  const [selectedAlliance, setSelectedAlliance] = useState<'red' | 'blue' | null>(null);
  
  // Margin bet state
  const [selectedMarginAlliance, setSelectedMarginAlliance] = useState<'red' | 'blue' | null>(null);
  const [selectedMargin, setSelectedMargin] = useState<number | null>(null);
  
  // Parlay margin alliance state (separate from regular margin tab)
  const [selectedParlayMarginAlliance, setSelectedParlayMarginAlliance] = useState<'red' | 'blue' | null>(null);
  
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
      setSelectedMarginAlliance(null);
      setSelectedMargin(null);
      setSelectedParlayMarginAlliance(null);
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

  // Calculate dynamic margin options (0.5x, 0.75x, 1x, 1.25x, 1.5x of expected margin)
  const marginOptions = useMemo(() => {
    if (!odds) return [];
    
    const expectedMargin = odds.expectedMargin;
    
    // Always return exactly 0.5x, 0.75x, 1x, 1.25x, and 1.5x of expected margin
    if (expectedMargin > 0) {
      return [
        Math.round(expectedMargin * 0.5),
        Math.round(expectedMargin * 0.75),
        Math.round(expectedMargin * 1.0),
        Math.round(expectedMargin * 1.25),
        Math.round(expectedMargin * 1.5),
      ];
    } else {
      // Default margins if no data (using 10 as base)
      return [5, 7, 10, 12, 15];
    }
  }, [odds]);

  // Calculate over/under thresholds (0.75x, 1x, 1.25x of expected total)
  const overUnderThresholds = useMemo(() => {
    if (!odds) return [];
    
    const expectedTotal = odds.expectedTotal;
    
    // Always return exactly 0.75x, 1x, and 1.25x of expected total
    if (expectedTotal > 0) {
      return [
        Math.round(expectedTotal * 0.75),
        Math.round(expectedTotal * 1.0),
        Math.round(expectedTotal * 1.25),
      ];
    } else {
      // Default thresholds if no data (using 100 as base)
      return [75, 100, 125];
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
          if (!selectedMarginAlliance) {
            Alert.alert('Invalid Bet', 'Please select an alliance');
            setIsPlacingBet(false);
            return;
          }
          betOdds = bettingService.calculateMarginOdds(
            odds.expectedMargin,
            selectedMargin,
            selectedMarginAlliance,
            odds.redAverage,
            odds.blueAverage,
            odds.matchConfidence
          );
          betData = {
            matchKey: match.key,
            matchNumber: match.match_number,
            eventKey,
            betType: 'margin',
            betDetails: { margin: selectedMargin, alliance: selectedMarginAlliance },
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
            overUnder,
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

  const removeParlayBet = (type: 'winner' | 'margin' | 'over_under', details?: any) => {
    if (details) {
      // Remove specific bet matching type and details
      setParlayBets(parlayBets.filter(b => {
        if (b.type !== type) return true;
        if (type === 'over_under') {
          const betThreshold = b.details?.threshold;
          const betOverUnder = b.details?.overUnder || b.details?.over_under;
          return !(betThreshold === details.threshold && betOverUnder === details.overUnder);
        }
        if (type === 'winner') {
          return b.details?.alliance !== details.alliance;
        }
        if (type === 'margin') {
          return b.details?.margin !== details.margin;
        }
        return true;
      }));
    } else {
      // Remove all bets of this type (for winner and margin, only one can exist)
      setParlayBets(parlayBets.filter(b => b.type !== type));
    }
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
          onPress={() => {
            setSelectedAlliance('red');
            setSelectedMarginAlliance('red');
          }}
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
          onPress={() => {
            setSelectedAlliance('blue');
            setSelectedMarginAlliance('blue');
          }}
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
        <Text style={styles.sectionTitle}>Wins By Margin</Text>
        <Text style={styles.sectionSubtitle}>
          Expected margin: {odds.expectedMargin.toFixed(1)} points
        </Text>

        {/* Alliance Selection */}
        <View style={styles.allianceSelection}>
          <TouchableOpacity
            style={[
              styles.allianceSelectButton,
              selectedMarginAlliance === 'red' && styles.allianceSelectButtonActive
            ]}
            onPress={() => {
              setSelectedMarginAlliance('red');
              setSelectedAlliance('red');
            }}
          >
            <Text style={[
              styles.allianceSelectText,
              selectedMarginAlliance === 'red' && styles.allianceSelectTextActive
            ]}>
              Red Wins
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.allianceSelectButton,
              selectedMarginAlliance === 'blue' && styles.allianceSelectButtonActive
            ]}
            onPress={() => {
              setSelectedMarginAlliance('blue');
              setSelectedAlliance('blue');
            }}
          >
            <Text style={[
              styles.allianceSelectText,
              selectedMarginAlliance === 'blue' && styles.allianceSelectTextActive
            ]}>
              Blue Wins
            </Text>
          </TouchableOpacity>
        </View>

        {selectedMarginAlliance && (
          <View style={styles.marginList}>
            {marginOptions.map((margin, index) => {
              const marginOdds = bettingService.calculateMarginOdds(
                odds.expectedMargin,
                margin,
                selectedMarginAlliance,
                odds.redAverage,
                odds.blueAverage,
                odds.matchConfidence
              );
              const isSelected = selectedMargin === margin;
              const multiplier = [0.5, 0.75, 1.0, 1.25, 1.5][index];
              const label = multiplier === 1.0 ? 'Expected' : `${multiplier}x`;

              return (
                <TouchableOpacity
                  key={margin}
                  style={[styles.marginListItem, isSelected && styles.marginListItemSelected]}
                  onPress={() => setSelectedMargin(margin)}
                >
                  <View style={styles.marginListLeft}>
                    <Text style={styles.marginListLabel}>{label}</Text>
                    <Text style={styles.marginListPoints}>{margin}+ points</Text>
                  </View>
                  <View style={styles.marginListRight}>
                    <Text style={[
                      styles.marginListOdds,
                      isSelected && styles.marginListOddsSelected
                    ]}>
                      {marginOdds.toFixed(2)}x
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
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

        <View style={styles.thresholdOptions}>
          {overUnderThresholds.map((threshold) => {
            const overOdds = bettingService.calculateOverUnderOdds(
              odds.expectedTotal,
              threshold,
              'over',
              odds.matchConfidence,
              odds.leagueAverage
            );
            const underOdds = bettingService.calculateOverUnderOdds(
              odds.expectedTotal,
              threshold,
              'under',
              odds.matchConfidence,
              odds.leagueAverage
            );
            const isOverSelected = selectedThreshold === threshold && overUnder === 'over';
            const isUnderSelected = selectedThreshold === threshold && overUnder === 'under';

            return (
              <View key={threshold} style={styles.overUnderRow}>
                <TouchableOpacity
                  style={[
                    styles.marginOption,
                    styles.overUnderButton,
                    isOverSelected && styles.marginOptionSelected
                  ]}
                  onPress={() => {
                    if (isOverSelected) {
                      // Deselect if already selected
                      setSelectedThreshold(null);
                      setOverUnder(null);
                    } else {
                      setSelectedThreshold(threshold);
                      setOverUnder('over');
                    }
                  }}
                >
                  <Text style={styles.marginOptionText}>Over {threshold}</Text>
                  <Text style={styles.marginOptionOdds}>{overOdds.toFixed(2)}x</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.marginOption,
                    styles.overUnderButton,
                    isUnderSelected && styles.marginOptionSelected
                  ]}
                  onPress={() => {
                    if (isUnderSelected) {
                      // Deselect if already selected
                      setSelectedThreshold(null);
                      setOverUnder(null);
                    } else {
                      setSelectedThreshold(threshold);
                      setOverUnder('under');
                    }
                  }}
                >
                  <Text style={styles.marginOptionText}>Under {threshold}</Text>
                  <Text style={styles.marginOptionOdds}>{underOdds.toFixed(2)}x</Text>
                </TouchableOpacity>
              </View>
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
          <Text style={styles.parlayOptionTitle}>Winner</Text>
          <View style={styles.parlayButtons}>
            <TouchableOpacity
              style={[
                styles.parlaySelectButton,
                parlayBets.find(b => b.type === 'winner' && b.details?.alliance === 'red') && styles.parlaySelectButtonSelected
              ]}
              onPress={() => {
                const existingBet = parlayBets.find(b => b.type === 'winner' && b.details?.alliance === 'red');
                if (existingBet) {
                  removeParlayBet('winner');
                } else {
                  setSelectedAlliance('red');
                  setSelectedParlayMarginAlliance('red');
                  addParlayBet('winner', { alliance: 'red' }, odds.redOdds);
                }
              }}
            >
              <Text style={[
                styles.parlaySelectText,
                parlayBets.find(b => b.type === 'winner' && b.details?.alliance === 'red') && styles.parlaySelectTextSelected
              ]}>
                Red ({odds.redOdds.toFixed(2)}x)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.parlaySelectButton,
                parlayBets.find(b => b.type === 'winner' && b.details?.alliance === 'blue') && styles.parlaySelectButtonSelected
              ]}
              onPress={() => {
                const existingBet = parlayBets.find(b => b.type === 'winner' && b.details?.alliance === 'blue');
                if (existingBet) {
                  removeParlayBet('winner');
                } else {
                  setSelectedAlliance('blue');
                  setSelectedParlayMarginAlliance('blue');
                  addParlayBet('winner', { alliance: 'blue' }, odds.blueOdds);
                }
              }}
            >
              <Text style={[
                styles.parlaySelectText,
                parlayBets.find(b => b.type === 'winner' && b.details?.alliance === 'blue') && styles.parlaySelectTextSelected
              ]}>
                Blue ({odds.blueOdds.toFixed(2)}x)
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Margin bet option */}
        <View style={styles.parlayOption}>
          <Text style={styles.parlayOptionTitle}>Margin</Text>
          {/* Alliance Selection for Margin */}
          <View style={styles.parlayAllianceSelection}>
            <TouchableOpacity
              style={[
                styles.parlayAllianceButton,
                (selectedParlayMarginAlliance === 'red' || parlayBets.find(b => b.type === 'margin' && b.details?.alliance === 'red')) && styles.parlayAllianceButtonActive
              ]}
              onPress={() => {
                // Remove existing margin bet if switching alliance
                const existingBet = parlayBets.find(b => b.type === 'margin');
                if (existingBet) {
                  removeParlayBet('margin');
                }
                setSelectedParlayMarginAlliance('red');
                // Also update winner selection if not already set
                const existingWinnerBet = parlayBets.find(b => b.type === 'winner');
                if (!existingWinnerBet || existingWinnerBet.details?.alliance !== 'red') {
                  setSelectedAlliance('red');
                  if (existingWinnerBet) {
                    removeParlayBet('winner');
                  }
                  addParlayBet('winner', { alliance: 'red' }, odds.redOdds);
                }
              }}
            >
              <Text style={[
                styles.parlayAllianceText,
                (selectedParlayMarginAlliance === 'red' || parlayBets.find(b => b.type === 'margin' && b.details?.alliance === 'red')) && styles.parlayAllianceTextActive
              ]}>
                Red
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.parlayAllianceButton,
                (selectedParlayMarginAlliance === 'blue' || parlayBets.find(b => b.type === 'margin' && b.details?.alliance === 'blue')) && styles.parlayAllianceButtonActive
              ]}
              onPress={() => {
                // Remove existing margin bet if switching alliance
                const existingBet = parlayBets.find(b => b.type === 'margin');
                if (existingBet) {
                  removeParlayBet('margin');
                }
                setSelectedParlayMarginAlliance('blue');
                // Also update winner selection if not already set
                const existingWinnerBet = parlayBets.find(b => b.type === 'winner');
                if (!existingWinnerBet || existingWinnerBet.details?.alliance !== 'blue') {
                  setSelectedAlliance('blue');
                  if (existingWinnerBet) {
                    removeParlayBet('winner');
                  }
                  addParlayBet('winner', { alliance: 'blue' }, odds.blueOdds);
                }
              }}
            >
              <Text style={[
                styles.parlayAllianceText,
                (selectedParlayMarginAlliance === 'blue' || parlayBets.find(b => b.type === 'margin' && b.details?.alliance === 'blue')) && styles.parlayAllianceTextActive
              ]}>
                Blue
              </Text>
            </TouchableOpacity>
          </View>
          {selectedParlayMarginAlliance && (
            <View style={styles.marginOptions}>
              {marginOptions.map((margin) => {
                const marginOdds = bettingService.calculateMarginOdds(
                  odds.expectedMargin,
                  margin,
                  selectedParlayMarginAlliance,
                  odds.redAverage,
                  odds.blueAverage,
                  odds.matchConfidence
                );
                const existingMarginBet = parlayBets.find(b => b.type === 'margin');
                const isSelected = existingMarginBet && existingMarginBet.details?.margin === margin;
                return (
                  <TouchableOpacity
                    key={margin}
                    style={[
                      styles.parlaySelectButton,
                      isSelected && styles.parlaySelectButtonSelected
                    ]}
                    onPress={() => {
                      if (isSelected) {
                        removeParlayBet('margin');
                      } else {
                        setSelectedMargin(margin);
                        addParlayBet('margin', { margin, alliance: selectedParlayMarginAlliance }, marginOdds);
                      }
                    }}
                  >
                    <Text style={[
                      styles.parlaySelectText,
                      isSelected && styles.parlaySelectTextSelected
                    ]}>
                      {margin}+ ({marginOdds.toFixed(2)}x)
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* Over/Under bet option */}
        <View style={styles.parlayOption}>
          <Text style={styles.parlayOptionTitle}>Over/Under</Text>
          <View style={styles.thresholdOptions}>
            {overUnderThresholds.slice(0, 3).map((threshold) => {
              const overOdds = bettingService.calculateOverUnderOdds(
                odds.expectedTotal,
                threshold,
                'over',
                odds.matchConfidence,
                odds.leagueAverage
              );
              const underOdds = bettingService.calculateOverUnderOdds(
                odds.expectedTotal,
                threshold,
                'under',
                odds.matchConfidence,
                odds.leagueAverage
              );
              const isOverSelected = parlayBets.find(b => 
                b.type === 'over_under' && 
                b.details?.threshold === threshold && 
                (b.details?.overUnder === 'over' || b.details?.over_under === 'over')
              );
              const isUnderSelected = parlayBets.find(b => 
                b.type === 'over_under' && 
                b.details?.threshold === threshold && 
                (b.details?.overUnder === 'under' || b.details?.over_under === 'under')
              );
              
              return (
                <View key={threshold} style={styles.parlayOverUnderRow}>
                  <TouchableOpacity
                    style={[
                      styles.parlaySelectButton,
                      isOverSelected && styles.parlaySelectButtonSelected
                    ]}
                    onPress={() => {
                      if (isOverSelected) {
                        removeParlayBet('over_under', { threshold, overUnder: 'over' });
                      } else {
                        setSelectedThreshold(threshold);
                        setOverUnder('over');
                        addParlayBet('over_under', { threshold, overUnder: 'over' }, overOdds);
                      }
                    }}
                  >
                    <Text style={[
                      styles.parlaySelectText,
                      isOverSelected && styles.parlaySelectTextSelected
                    ]}>
                      Over {threshold} ({overOdds.toFixed(2)}x)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.parlaySelectButton,
                      isUnderSelected && styles.parlaySelectButtonSelected
                    ]}
                    onPress={() => {
                      if (isUnderSelected) {
                        removeParlayBet('over_under', { threshold, overUnder: 'under' });
                      } else {
                        setSelectedThreshold(threshold);
                        setOverUnder('under');
                        addParlayBet('over_under', { threshold, overUnder: 'under' }, underOdds);
                      }
                    }}
                  >
                    <Text style={[
                      styles.parlaySelectText,
                      isUnderSelected && styles.parlaySelectTextSelected
                    ]}>
                      Under {threshold} ({underOdds.toFixed(2)}x)
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </View>

        {parlayBets.length > 0 && (
          <View style={styles.parlaySummary}>
            <Text style={styles.parlaySummaryTitle}>Parlay Summary</Text>
            {parlayBets.map((bet, index) => {
              const formatBetType = (type: string): string => {
                const typeMap: Record<string, string> = {
                  winner: 'Winner',
                  margin: 'Margin',
                  over_under: 'Over/Under',
                };
                return typeMap[type] || type;
              };
              
              const getBetDescription = (bet: { type: string; details: any }): string => {
                switch (bet.type) {
                  case 'winner':
                    return `${bet.details?.alliance === 'red' ? 'Red' : 'Blue'} wins`;
                  case 'margin':
                    const alliance = bet.details?.alliance === 'red' ? 'Red' : 'Blue';
                    return `${alliance} wins by ${bet.details?.margin}+ points`;
                  case 'over_under':
                    const overUnder = bet.details?.overUnder || bet.details?.over_under;
                    return `Total ${overUnder === 'over' ? 'Over' : 'Under'} ${bet.details?.threshold}`;
                  default:
                    return '';
                }
              };
              
              return (
                <Text key={index} style={styles.parlaySummaryItem}>
                  {formatBetType(bet.type)}: {getBetDescription(bet)} ({bet.odds.toFixed(2)}x)
                </Text>
              );
            })}
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
        if (selectedMargin !== null && selectedMarginAlliance) {
          betOdds = bettingService.calculateMarginOdds(
            odds.expectedMargin,
            selectedMargin,
            selectedMarginAlliance,
            odds.redAverage,
            odds.blueAverage,
            odds.matchConfidence
          );
        }
        break;
      case 'over_under':
        if (selectedThreshold !== null && overUnder) {
          betOdds = bettingService.calculateOverUnderOdds(
            odds.expectedTotal,
            selectedThreshold,
            overUnder,
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
      <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
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
            <KeyboardAvoidingView
              style={styles.keyboardAvoidingView}
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : insets.top + 20}
            >
              <ScrollView 
                style={styles.scrollView} 
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
              >
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
            </KeyboardAvoidingView>

            {/* Place Bet Button */}
            <View style={[styles.footer, { paddingBottom: Math.max(16, insets.bottom) }]}>
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
    maxHeight: '100%',
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
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 20,
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
  marginList: {
    gap: 10,
  },
  marginListItem: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  marginListItemSelected: {
    borderColor: '#ff6600',
    backgroundColor: '#3a2a1a',
  },
  marginListLeft: {
    flex: 1,
  },
  marginListLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  marginListPoints: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  marginListRight: {
    paddingLeft: 16,
  },
  marginListOdds: {
    color: '#ff6600',
    fontSize: 22,
    fontWeight: 'bold',
  },
  marginListOddsSelected: {
    color: '#ff8833',
  },
  allianceSelection: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  allianceSelectButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#2a2a2a',
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  allianceSelectButtonActive: {
    backgroundColor: '#3a2a1a',
    borderColor: '#ff6600',
  },
  allianceSelectText: {
    color: '#b0b0b0',
    fontSize: 16,
    fontWeight: '500',
  },
  allianceSelectTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  parlayAllianceSelection: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  parlayAllianceButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#404040',
    alignItems: 'center',
  },
  parlayAllianceButtonActive: {
    borderColor: '#ff6600',
    borderWidth: 2,
  },
  parlayAllianceText: {
    color: '#b0b0b0',
    fontSize: 14,
    fontWeight: '500',
  },
  parlayAllianceTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  overUnderToggle: {
    flexDirection: 'column',
    gap: 8,
    marginBottom: 16,
  },
  toggleButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#2a2a2a',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  toggleButtonActive: {
    backgroundColor: '#3a2a1a',
    borderColor: '#ff6600',
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
  parlaySelectButtonSelected: {
    borderColor: '#ff6600',
    borderWidth: 2,
    shadowColor: '#ff6600',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  parlaySelectText: {
    color: '#fff',
    fontSize: 12,
  },
  parlaySelectTextSelected: {
    color: '#ff6600',
    fontWeight: '600',
  },
  overUnderRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    width: '100%',
  },
  overUnderButton: {
    flex: 1,
  },
  parlayOverUnderRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
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
