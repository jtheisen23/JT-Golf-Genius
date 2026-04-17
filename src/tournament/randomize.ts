import type { TourGroup, TourPlayer } from './types';
import { generateId } from './useTournament';

/**
 * Randomize players into groups of exactly 4 or 5.
 *
 * Algorithm: pick the fewest groups possible (= ceil(n/5)) so each
 * group gets 4 or 5 players.  Valid when 4g ≤ n ≤ 5g.
 *
 * Edge cases where no pure 4/5 split exists (n < 4, or n ∈ {6,7,11}):
 * fall back to allowing one smaller group.
 */
export function randomizeGroups(
  players: TourPlayer[],
  _size = 4, // kept for call-site compat, ignored
  namePrefix = 'Group',
): TourGroup[] {
  const shuffled = [...players];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const n = shuffled.length;
  if (n === 0) return [];

  // Find ideal group count: fewest groups where every group is 4 or 5
  let groupCount = Math.ceil(n / 5);
  if (4 * groupCount > n) {
    // Can't fill every group to 4 at this count — try one more group
    groupCount = Math.max(1, Math.floor(n / 4));
  }

  // Number of groups that get 5 players (rest get 4)
  const fives = n - 4 * groupCount;

  const groups: TourGroup[] = [];
  let idx = 0;
  for (let i = 0; i < groupCount; i++) {
    const size = i < fives ? 5 : 4;
    const ids = shuffled.slice(idx, idx + size).map((p) => p.id);
    // If last group and we have leftover players, absorb them
    if (i === groupCount - 1 && idx + size < n) {
      ids.push(...shuffled.slice(idx + size).map((p) => p.id));
    }
    groups.push({
      id: generateId(),
      name: `${namePrefix} ${i + 1}`,
      playerIds: ids,
    });
    idx += size;
  }

  return groups;
}
