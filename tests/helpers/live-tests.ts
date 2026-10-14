/** Live-model tests call the paid provider. They run only with VOCAL_LIVE_TESTS=1 (and a key). */
export function liveTestsEnabled() {
  return process.env.VOCAL_LIVE_TESTS === "1";
}

export const LIVE_SKIP_REASON =
  "live-model test: calls the paid provider; set VOCAL_LIVE_TESTS=1 and GROQ_API_KEY to run it";
