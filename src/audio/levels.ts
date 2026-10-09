/** Level conventions of the sound bank (shared by the synthesised and the sampled path). */

/** RMS that beds are normalized to before their mix gain. */
export const BED_RMS = 0.16;
/** Short-term (50 ms) RMS that one-shots are normalized to before their mix gain (≈ -14 dBFS). */
export const ONESHOT_LOUDNESS = 0.2;
/** Highest peak a baked one-shot may have. */
export const ONESHOT_PEAK = 0.95;
