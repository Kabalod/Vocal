/** R8 a11y / adaptive contracts (source-level; no e2e runner). */

export const R8_VIEWPORTS = [320, 360, 390, 1024, 1280] as const;

export const R8_KEY_ROUTES = ["/reels", "/reels/[id]", "/profile"] as const;

export const TOUCH_TARGET_MIN_PX = 44;

export const TOUCH_TARGET_CLASSES = ["min-h-11", "h-11", "min-h-12"] as const;

/** AiCall.promptText may remain in SQLite; R8 only forbids printing it in logs. */
export const AICALL_PROMPT_TEXT_IN_DB_ALLOWED = true;
