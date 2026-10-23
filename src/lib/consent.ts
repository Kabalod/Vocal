/**
 * Consent to the data notice. No migration: the fact lives in Supabase `user_metadata` (written by the browser client with
 * `auth.updateUser({ data })`, read back from `auth.getUser()`), so nothing is added to the Prisma schema. It is a UI-level
 * record: no API route checks it, and the user can edit their own metadata.
 * When the notice text changes in substance, bump CONSENT_VERSION and everyone is asked once more.
 */
export const CONSENT_VERSION = "2026-10-23";
export const CONSENT_META_KEY = "vocal_consent";
/** Local UI runs without Supabase: the same fact is remembered in this browser only. */
export const CONSENT_LOCAL_KEY = "vocal-consent-version";

type Metadata = Record<string, unknown> | null | undefined;

export function hasCurrentConsent(metadata: Metadata): boolean {
  const record = metadata?.[CONSENT_META_KEY];
  if (!record || typeof record !== "object") return false;
  return (record as { version?: unknown }).version === CONSENT_VERSION;
}

export function consentMetadata(now: Date = new Date()): Record<string, { version: string; acceptedAt: string }> {
  return { [CONSENT_META_KEY]: { version: CONSENT_VERSION, acceptedAt: now.toISOString() } };
}

export type FeedbackLink = { href: string; external: boolean };

/**
 * `VOCAL_FEEDBACK_URL`: a `mailto:` link, an `https://` link or a bare e-mail address. Anything else (and an unset variable)
 * returns null and the profile row is hidden.
 */
export function feedbackLink(raw: string | null | undefined): FeedbackLink | null {
  const value = raw?.trim();
  if (!value) return null;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(value.replace(/\?.*$/, ""))) return { href: value, external: false };
  if (/^https:\/\/[^\s/]+\S*$/i.test(value)) return { href: value, external: true };
  if (/^[^\s@:]+@[^\s@:]+\.[^\s@:]+$/.test(value)) return { href: `mailto:${value}`, external: false };
  return null;
}
