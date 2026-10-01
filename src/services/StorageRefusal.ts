/** The word chrome uses when a storage area has no room left. */
const QUOTA_REFUSAL = "quota";

/**
 * Reports whether a rejected storage write was refused for want of room.
 *
 * Chrome rejects with an Error reading "Session storage quota bytes exceeded"
 * and carries no code to test, so its message is the only thing available.
 *
 * Use this to decide what to report and not whether to recover. A caller that
 * only reset when this returned true would, the day the wording changes, leave
 * the cache full and stop caching for the rest of the session in silence.
 * @param error Whatever the write rejected with.
 * @returns true if the message names a quota; otherwise, false.
 */
export const isQuotaRefusal = (error: unknown): boolean =>
    String(error).toLowerCase().includes(QUOTA_REFUSAL);
