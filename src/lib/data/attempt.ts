/** Await a query without throwing: returns the data (or a fallback) and whether it failed. */
export async function attempt<T>(promise: Promise<T>, fallback: T): Promise<{ data: T; failed: boolean }> {
  try {
    return { data: await promise, failed: false };
  } catch (error) {
    console.error("[data] query failed", error instanceof Error ? error.message : error);
    return { data: fallback, failed: true };
  }
}
