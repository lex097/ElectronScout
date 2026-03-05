// services/qrCodeService.ts
// Generates QR code payloads from match data. Max 15 matches per QR code.

import { calculateMatchPoints } from '../config/gameConfig';
import { MatchData } from '../types/match';

const MATCHES_PER_QR = 15;

/** Compact match format for QR payload (fits ~15 matches in ~2500 bytes) */
interface CompactMatch {
  i: string;
  m: number;
  t: number;
  s: string;
  y: number;
  d: Record<string, any>;
  ts: number;
  n?: string;
  sv?: Record<string, any>;
  a?: 'red' | 'blue';
  cp?: number;
}

function toCompactMatch(match: MatchData): CompactMatch {
  const metrics = typeof match.metrics === 'string' ? JSON.parse(match.metrics) : match.metrics;
  const cp = calculateMatchPoints(metrics);
  return {
    i: match.id,
    m: match.matchNumber,
    t: match.teamNumber,
    s: match.scouterId || 'unknown',
    y: match.gameYear,
    d: metrics,
    ts: match.timestamp,
    n: match.notes || undefined,
    sv: match.survey || undefined,
    a: match.allianceColor,
    cp,
  };
}

/** Parse QR payload and convert to MatchData[] */
export function parseQRPayload(json: string): MatchData[] {
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.m)) return [];
    const matches: MatchData[] = [];
    for (const c of parsed.m) {
      if (!c || !c.i || !c.m || !c.t || !c.d) continue;
      matches.push({
        id: String(c.i),
        matchNumber: Number(c.m),
        teamNumber: Number(c.t),
        scouterId: String(c.s || 'unknown'),
        gameYear: Number(c.y || new Date().getFullYear()),
        metrics: c.d,
        timestamp: Number(c.ts || Date.now()),
        synced: false,
        notes: c.n || undefined,
        survey: c.sv || undefined,
        allianceColor: c.a || undefined,
      });
    }
    return matches;
  } catch {
    return [];
  }
}

/**
 * Chunk matches into groups of max 15, serialize each to JSON for QR encoding.
 * Returns array of JSON strings - one per QR code.
 */
export function chunkMatchesForQR(
  matches: MatchData[],
  eventKey?: string | null
): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < matches.length; i += MATCHES_PER_QR) {
    const slice = matches.slice(i, i + MATCHES_PER_QR);
    const compact = slice.map((m) => toCompactMatch(m));
    const payload = JSON.stringify({ v: 1, e: eventKey || null, m: compact });
    chunks.push(payload);
  }
  return chunks;
}
