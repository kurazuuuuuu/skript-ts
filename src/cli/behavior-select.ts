/**
 * Deterministic behavior-suite selection for `verify --fast`.
 *
 * The behavior stage dominates a full verify run (measured: ~348s of a
 * ~380s engine-mode run for 27 suites), so the dev loop needs a cheaper
 * signal that is still reproducible. `--fast` runs a stable one-in-three
 * subsample: a suite is selected when the FNV-1a hash of its file name
 * is divisible by 3. Hashing the name (instead of taking every Nth file
 * of the sorted list) keeps a suite's membership stable when other
 * suites are added or removed, so a suite that is in the sample stays
 * in the sample across runs and machines. Full verify (no --fast)
 * remains the gate; --fast never changes what a full run covers.
 */

export const FAST_SAMPLE_MODULUS = 3;

/** FNV-1a 32-bit hash of a string, returned as an unsigned integer. */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** True when the suite file belongs to the deterministic --fast sample. */
export function inFastSample(fileName: string): boolean {
  return fnv1a32(fileName) % FAST_SAMPLE_MODULUS === 0;
}

/**
 * The suites to execute. With `fast` false this is the input unchanged;
 * with `fast` true it is the deterministic subsample, order preserved.
 */
export function selectBehaviorSuites(files: string[], fast: boolean): string[] {
  if (!fast) return files;
  return files.filter((f) => inFastSample(f));
}
