/**
 * @file Stratified sampling for `vibe: mixed`.
 *
 * When the user asks for `vibe: mixed`, we want the result to feel like a
 * discovery mix: some heavy hitters from the top of Deezer's ranked list,
 * some mid-tier, and some long-tail entries. A uniform random sample over
 * the entire list would bias strongly toward the "middle mass" because
 * there are many more mid-ranked entries than top ones.
 *
 * The algorithm:
 *
 *   1. Split the input list into three equally-sized strata (top /
 *      middle / tail). If the list isn't evenly divisible, the top
 *      stratum absorbs the remainder so the best-ranked items are never
 *      truncated from consideration.
 *   2. Aim for `floor(count / 3)` picks from each stratum. Distribute
 *      any remainder (from `count % 3`) to the top stratum so the mix
 *      always leans slightly toward quality when the count doesn't
 *      divide evenly.
 *   3. Random sampling *within* each stratum uses a partial Fisher-Yates
 *      shuffle so it's O(count) rather than O(input).
 *
 * If the input is shorter than `count`, the whole input is returned in
 * its original (ranked) order — sampling would just reshuffle a set the
 * caller already wanted in full.
 */

/**
 * Pick a stratified sample of `count` items from the ranked `input` list.
 * `input[0]` is treated as the highest-ranked element.
 *
 * @param input  source list, already ordered by rank (highest first)
 * @param count  desired sample size
 * @param rng    optional random number generator in `[0, 1)`; defaults to
 *               `Math.random`. Tests inject a deterministic RNG here.
 */
export function stratifiedSample<T>(input: T[], count: number, rng: () => number = Math.random): T[] {
  if (count <= 0 || input.length === 0) return [];
  if (input.length <= count) return input.slice();

  // Stratum sizes: middle and tail each floor(n/3); top absorbs remainder.
  const n = input.length;
  const tailSize = Math.floor(n / 3);
  const middleSize = Math.floor(n / 3);
  const topSize = n - middleSize - tailSize;

  const top = input.slice(0, topSize);
  const middle = input.slice(topSize, topSize + middleSize);
  const tail = input.slice(topSize + middleSize);

  // Per-stratum pick counts: floor(count/3) each, remainder goes to top.
  const perStratum = Math.floor(count / 3);
  const remainder = count - perStratum * 3;
  const picks = [
    sampleFrom(top, perStratum + remainder, rng),
    sampleFrom(middle, perStratum, rng),
    sampleFrom(tail, perStratum, rng),
  ];

  return [...picks[0], ...picks[1], ...picks[2]];
}

/**
 * Random subset of size `k` from `pool` without modifying `pool`. Uses a
 * partial Fisher-Yates shuffle on a copy, so it's O(pool.length) even for
 * small `k`.
 */
function sampleFrom<T>(pool: T[], k: number, rng: () => number): T[] {
  if (k <= 0) return [];
  if (k >= pool.length) return pool.slice();

  const copy = pool.slice();
  const out: T[] = [];
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
    out.push(copy[i]);
  }
  return out;
}
