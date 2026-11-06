/**
 * Pure fixture generators — no database access, fully unit-testable.
 * Used by the scheduling server actions.
 */

const BYE = "__BYE__";

export interface GeneratedFixture {
  round: number;
  roundName: string;
  homeTeamId: string;
  awayTeamId: string;
  kickoffTime: string;
  venueIndex: number;
  matchNumber: number;
}

export interface RoundRobinOptions {
  startDate: Date;
  intervalDays?: number;
  doubleRound?: boolean;
  venueCount?: number;
  kickoffHour?: number;
  firstMatchNumber?: number;
  matchdayLabel?: string;
}

function kickoffAt(base: Date, dayOffset: number, hour: number): string {
  const date = new Date(base);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

/**
 * Circle (polygon) method. Every team plays exactly once per round, so there
 * can never be a time-slot collision within a round regardless of how many
 * pitches are available.
 */
export function generateRoundRobin(
  teamIds: string[],
  options: RoundRobinOptions,
): GeneratedFixture[] {
  const {
    startDate,
    intervalDays = 7,
    doubleRound = false,
    venueCount = 1,
    kickoffHour = 15,
    firstMatchNumber = 1,
    matchdayLabel = "Matchday",
  } = options;

  const unique = Array.from(new Set(teamIds)).filter(Boolean);
  if (unique.length < 2) return [];

  const pool = [...unique];
  if (pool.length % 2 !== 0) pool.push(BYE);

  const size = pool.length;
  const half = size / 2;
  const totalRounds = size - 1;

  let rotation = [...pool];
  const fixtures: GeneratedFixture[] = [];
  let matchNumber = firstMatchNumber;

  for (let round = 0; round < totalRounds; round += 1) {
    const roundIndex = round + 1;
    let slot = 0;

    for (let i = 0; i < half; i += 1) {
      const a = rotation[i];
      const b = rotation[size - 1 - i];
      if (!a || !b || a === BYE || b === BYE) continue;

      const home = (round + i) % 2 === 0 ? a : b;
      const away = home === a ? b : a;
      const venueIndex = slot % Math.max(venueCount, 1);
      const wave = Math.floor(slot / Math.max(venueCount, 1));

      fixtures.push({
        round: roundIndex,
        roundName: `${matchdayLabel} ${roundIndex}`,
        homeTeamId: home,
        awayTeamId: away,
        kickoffTime: kickoffAt(startDate, round * intervalDays, Math.min(kickoffHour + wave * 2, 22)),
        venueIndex,
        matchNumber: matchNumber++,
      });
      slot += 1;
    }

    const fixed = rotation[0]!;
    const rest = rotation.slice(1);
    const last = rest.pop();
    if (last) rest.unshift(last);
    rotation = [fixed, ...rest];
  }

  if (!doubleRound) return fixtures;

  const secondLeg = fixtures.map((fixture) => ({
    ...fixture,
    round: fixture.round + totalRounds,
    roundName: `${matchdayLabel} ${fixture.round + totalRounds}`,
    homeTeamId: fixture.awayTeamId,
    awayTeamId: fixture.homeTeamId,
    kickoffTime: kickoffAt(
      startDate,
      (fixture.round - 1 + totalRounds) * intervalDays,
      new Date(fixture.kickoffTime).getHours(),
    ),
    matchNumber: matchNumber++,
  }));

  return [...fixtures, ...secondLeg];
}

export interface BracketNode {
  key: string;
  round: number;
  roundName: string;
  matchNumber: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  nextKey: string | null;
  nextSlot: "HOME" | "AWAY" | null;
  kickoffTime: string;
  venueIndex: number;
}

export interface KnockoutOptions {
  startDate: Date;
  intervalDays?: number;
  firstMatchNumber?: number;
  venueCount?: number;
  kickoffHour?: number;
}

export function nextPowerOfTwo(value: number): number {
  if (value <= 1) return 1;
  return 2 ** Math.ceil(Math.log2(value));
}

/** Standard bracket seeding: 1 v 8, 4 v 5, 2 v 7, 3 v 6 for a size-8 draw. */
function seedPositions(size: number): number[] {
  let positions = [1, 2];
  while (positions.length < size) {
    const sum = positions.length * 2 + 1;
    positions = positions.flatMap((seed) => [seed, sum - seed]);
  }
  return positions;
}

export function knockoutRoundName(teamsInRound: number): string {
  switch (teamsInRound) {
    case 2:
      return "Final";
    case 4:
      return "Semi-final";
    case 8:
      return "Quarter-final";
    case 16:
      return "Round of 16";
    case 32:
      return "Round of 32";
    default:
      return `Round of ${teamsInRound}`;
  }
}

/**
 * Builds a fully wired bracket. `nextKey`/`nextSlot` point at the match the
 * winner advances to, which the SQL trigger follows automatically.
 */
export function buildKnockoutBracket(
  teamIds: string[],
  options: KnockoutOptions,
): BracketNode[] {
  const {
    startDate,
    intervalDays = 3,
    firstMatchNumber = 1,
    venueCount = 1,
    kickoffHour = 15,
  } = options;

  const unique = Array.from(new Set(teamIds)).filter(Boolean);
  if (unique.length < 2) return [];

  const size = nextPowerOfTwo(unique.length);
  const totalRounds = Math.log2(size);
  const order = seedPositions(size);

  const nodes: BracketNode[] = [];
  let matchNumber = firstMatchNumber;

  for (let round = 1; round <= totalRounds; round += 1) {
    const matchesInRound = size / 2 ** round;
    const teamsInRound = size / 2 ** (round - 1);

    for (let index = 0; index < matchesInRound; index += 1) {
      const isFirstRound = round === 1;
      const homeSeed = order[index * 2];
      const awaySeed = order[index * 2 + 1];

      const homeTeamId =
        isFirstRound && homeSeed ? (unique[homeSeed - 1] ?? null) : null;
      const awayTeamId =
        isFirstRound && awaySeed ? (unique[awaySeed - 1] ?? null) : null;

      const nextRound = round + 1;
      const nextKey =
        round < totalRounds ? `R${nextRound}M${Math.floor(index / 2)}` : null;

      nodes.push({
        key: `R${round}M${index}`,
        round,
        roundName: knockoutRoundName(teamsInRound),
        matchNumber: matchNumber++,
        homeTeamId,
        awayTeamId,
        nextKey,
        nextSlot: nextKey ? (index % 2 === 0 ? "HOME" : "AWAY") : null,
        kickoffTime: kickoffAt(startDate, (round - 1) * intervalDays, kickoffHour),
        venueIndex: index % Math.max(venueCount, 1),
      });
    }
  }

  return nodes;
}

/** Fisher–Yates shuffle (non-mutating). */
export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = copy[i];
    const b = copy[j];
    if (a !== undefined && b !== undefined) {
      copy[i] = b;
      copy[j] = a;
    }
  }
  return copy;
}

export interface DrawnGroup {
  name: string;
  teamIds: string[];
}

/**
 * Pot-based group draw: stronger seeds are spread across groups so no group
 * receives two top seeds.
 */
export function potDraw(teamIds: string[], groupCount: number): DrawnGroup[] {
  const groups: DrawnGroup[] = Array.from({ length: groupCount }, (_, index) => ({
    name: `Group ${String.fromCharCode(65 + index)}`,
    teamIds: [],
  }));

  if (groupCount < 1) return [];
  const shuffled = shuffle(teamIds);
  const pots: string[][] = [];
  for (let i = 0; i < shuffled.length; i += groupCount) {
    pots.push(shuffled.slice(i, i + groupCount));
  }

  pots.forEach((pot, potIndex) => {
    const order =
      potIndex % 2 === 0
        ? groups.map((_, i) => i)
        : groups.map((_, i) => i).reverse();

    shuffle(pot).forEach((teamId, index) => {
      const groupIndex = order[index];
      if (groupIndex !== undefined) {
        groups[groupIndex]?.teamIds.push(teamId);
      }
    });
  });

  return groups.filter((group) => group.teamIds.length > 0);
}
