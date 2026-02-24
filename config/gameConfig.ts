// config/gameConfig.ts
// Change this file each year - nothing else needs to change!

export type MetricType = 'counter' | 'boolean' | 'select' | 'timer' | 'rapidCounter';

export interface Metric {
  id: string;
  type: MetricType;
  label: string;
  max?: number;
  points?: number;
  pointsMap?: Record<string, number>; // Points map for select options
  options?: string[];
  defaultValue?: any;
  // Rapid counter specific properties
  minRate?: number; // Minimum rate per second (default: 1)
  maxRate?: number; // Maximum rate per second (default: 10)
}

export interface GamePhase {
  id: string;
  label: string;
  duration?: number; // seconds
  metrics: Metric[];
}

export interface GameConfig {
  year: number;
  gameName: string;
  phases: GamePhase[];
}

// ============================================
// 2025 GAME CONFIG - Change this each year!
// ============================================
// export const GAME_2025: GameConfig = {
//     year: 2025,
//     gameName: "Reefscape",
//     phases: [
//       {
//         id: "auto",
//         label: "Autonomous",
//         duration: 15,
//         metrics: [
//           {
//             id: "mobility",
//             type: "boolean",
//             label: "Left Starting Zone",
//             points: 2,
//             defaultValue: false
//           },
//           {
//             id: "autoL4",
//             type: "counter",
//             label: "L4 Coral",
//             points: 7,
//             max: 12,
//             defaultValue: 0
//           },
//           {
//             id: "autoL3",
//             type: "counter",
//             label: "L3 Coral",
//             points: 5,
//             max: 12,
//             defaultValue: 0
//           },
//           {
//             id: "autoL2",
//             type: "counter",
//             label: "L2 Coral",
//             max: 12,
//             points: 3,
//             defaultValue: 0
//           },
//           {
//             id: "autoL1",
//             type: "counter",
//             label: "L1 Coral",
//             points: 2,
//             max: 24,
//             defaultValue: 0
//           },
//         ]
//       },
//       {
//         id: "teleop",
//         label: "Teleoperated",
//         duration: 135,
//         metrics: [
//             {
//                 id: "L4 Tele",
//                 type: "counter",
//                 label: "L4 Coral",
//                 points: 5,
//                 max: 12,
//                 defaultValue: 0
//               },
//               {
//                 id: "L3 Tele",
//                 type: "counter",
//                 label: "L3 Coral",
//                 points: 3,
//                 max: 12,
//                 defaultValue: 0
//               },
//               {
//                 id: "L2 Tele",
//                 type: "counter",
//                 label: "L2 Coral",
//                 points: 2,
//                 max: 12,
//                 defaultValue: 0
//               },
//               {
//                 id: "L1 Tele",
//                 type: "counter",
//                 label: "L1 Coral",
//                 points: 1,
//                 max: 24,
//                 defaultValue: 0
//               },
//         ]
//       },
//       {
//         id: "endgame",
//         label: "Endgame",
//         metrics: [
//           {
//             id: "climb",
//             type: "select",
//             label: "Climb Status",
//             options: ["None", "Parked", "Deep Cage", "Shallow Cage"],
//             pointsMap: {
//                 "None": 0,
//                 "Parked": 2,
//                 "Deep Cage": 12,
//                 "Shallow Cage": 6,
//             },
//             defaultValue: "None"
//           },
//         ]
//       }
//     ]
//   };


// 2026 GAME CONFIG - Change this each year!
export const GAME_2026: GameConfig = {
  year: 2026,
  gameName: "Rebuilt",
  phases: [
    {
      id: "auto",
      label: "Autonomous",
      duration: 23,
      metrics: [
        {
          id: "fuelAuto",
          type: "rapidCounter",
          label: "Fuel Scored",
          points: 1,
          defaultValue: 0,
          minRate: 2,
          maxRate: 20
        },
        {
          id: "passAuto",
          type: "rapidCounter",
          label: "Fuel Passed",
          points: 0,
          defaultValue: 0,
          minRate: 2,
          maxRate: 20
        },
        {id: "climbAuto",
        type: "boolean",
        label: "Climbed",
        points: 15,
        defaultValue: false
        }
      ]
    },
    {
      id: "teleop",
      label: "Teleoperated",
      duration: 130,
      metrics: [
            {
            id: "fuelTele",
            type: "rapidCounter",
            label: "Fuel Scored",
            points: 1,
            defaultValue: 0,
            minRate: 2,
            maxRate: 20
            },
            {
              id: "fuelPass",
              type: "rapidCounter",
              label: "Fuel Passed",
              points: 0,
              defaultValue: 0,
              minRate: 2,
              maxRate: 20
            }
      ]
    },
    {
      id: "endgame",
      label: "Endgame",
      metrics: [
        {
          id: "climb",
          type: "select",
          label: "Climb Status",
          options: ["None", "L1", "L2", "L3"],
          pointsMap: {
              "None": 0,
              "L1": 10,
              "L2": 20,
              "L3": 30,
          },
          defaultValue: "None"
        },
      ]
    }
  ]
};

// Active config - change this to switch years
export const ACTIVE_GAME_CONFIG = GAME_2026;

// Helper to get initial match data structure
export const getInitialMatchData = (config: GameConfig = ACTIVE_GAME_CONFIG) => {
  const metrics: Record<string, any> = {};
  
  config.phases.forEach(phase => {
    phase.metrics.forEach(metric => {
      metrics[metric.id] = metric.defaultValue ?? (
        metric.type === 'counter' || metric.type === 'rapidCounter' ? 0 :
        metric.type === 'boolean' ? false :
        metric.type === 'select' ? metric.options?.[0] ?? null :
        null
      );
    });
  });
  
  return metrics;
};

// Helper to get default values for specific phases (e.g. reset teleop/endgame when auto ends)
export const getDefaultsForPhases = (
  phaseIds: string[],
  config: GameConfig = ACTIVE_GAME_CONFIG
): Record<string, any> => {
  const metrics: Record<string, any> = {};
  config.phases
    .filter((p) => phaseIds.includes(p.id))
    .forEach((phase) => {
      phase.metrics.forEach((metric) => {
        metrics[metric.id] =
          metric.defaultValue ??
          (metric.type === 'counter' || metric.type === 'rapidCounter'
            ? 0
            : metric.type === 'boolean'
              ? false
              : metric.type === 'select'
                ? metric.options?.[0] ?? null
                : null);
      });
    });
  return metrics;
};

// Helper to get metric by ID
export const getMetricById = (metricId: string, config: GameConfig = ACTIVE_GAME_CONFIG): Metric | null => {
  for (const phase of config.phases) {
    const metric = phase.metrics.find(m => m.id === metricId);
    if (metric) return metric;
  }
  return null;
};

// Calculate total points for a match
export const calculateMatchPoints = (metrics: Record<string, any>, config: GameConfig = ACTIVE_GAME_CONFIG): number => {
    let totalPoints = 0;
    const breakdown: Record<string, number> = {};
  
    config.phases.forEach(phase => {
      phase.metrics.forEach(metric => {
        const value = metrics[metric.id];
        let points = 0;
  
        switch (metric.type) {
          case 'counter':
          case 'rapidCounter':
            if (typeof value === 'number' && metric.points) {
              points = value * metric.points;
              totalPoints += points;
            }
            break;
  
          case 'boolean':
            if (value === true && metric.points) {
              points = metric.points;
              totalPoints += points;
            }
            break;
  
          case 'select':
            if (metric.pointsMap && typeof value === 'string') {
              points = metric.pointsMap[value] || 0;
              totalPoints += points;
            }
            break;
        }
        
        if (points > 0) {
          breakdown[metric.id] = points;
        }
      });
    });
  
    // console.log('Points Calculation:', {
    //   metrics,
    //   breakdown,
    //   totalPoints
    // });
  
    return totalPoints;
  };

