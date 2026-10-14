"use client";

import "./resource.css";

/**
 * Mock costs in tenths of a percent of the period resource:
 * a script build takes 1%, each Vocal reply in the dialog 0.2%.
 */
export const BUILD_COST = 10;
export const REPLY_COST = 2;

export type ResourceLevel = "ok" | "low" | "critical" | "out";

/** Whole percent shown to the user (rounded down). */
export const wholePercent = (resource: number) => Math.floor(resource);

/** "72%"; "<1%" while something is left but less than a whole percent. */
export const formatPercent = (resource: number) =>
  resource > 0 && resource < 1 ? "<1%" : `${wholePercent(resource)}%`;

export const resourceLevel = (resource: number): ResourceLevel => {
  if (resource <= 0) return "out";
  const whole = wholePercent(resource);
  return whole <= 5 ? "critical" : whole <= 20 ? "low" : "ok";
};

/** Hint scale: 1% of the resource is about one thought. */
export const thoughtsLeft = (resource: number) => wholePercent(resource);

export const pluralThoughts = (count: number) => {
  const tail = count % 100;
  if (tail >= 11 && tail <= 14) return "мыслей";
  const last = count % 10;
  if (last === 1) return "мысль";
  return last >= 2 && last <= 4 ? "мысли" : "мыслей";
};

/** "Ресурс на период: N%" with a progress bar; amber at <=20%, red at <=5%. */
export function ResourceMeter({ percent, compact = false }: { percent: number; compact?: boolean }) {
  const level = resourceLevel(percent);
  const left = thoughtsLeft(percent);
  const label = formatPercent(percent);
  const hint =
    percent <= 0
      ? "Продлите, чтобы продолжить"
      : left < 1
        ? "≈ хватит меньше чем на 1 мысль"
        : `≈ хватит ещё на ~${left} ${pluralThoughts(left)}`;
  return (
    <div className={`resource-meter level-${level} ${compact ? "compact" : ""}`}>
      <strong>Ресурс на период: {label}</strong>
      <span
        role="progressbar"
        aria-label="Ресурс на период"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={wholePercent(percent)}
        aria-valuetext={label}
      >
        <i style={{ width: `${percent > 0 ? Math.max(percent, 1) : 0}%` }} />
      </span>
      <small>{hint}</small>
    </div>
  );
}

/** Soft warning at 20% and a stronger one at 5%. */
export function ResourceNotice({ percent, onRenew, onClose }: { percent: number; onRenew?: () => void; onClose?: () => void }) {
  const critical = resourceLevel(percent) === "critical";
  return (
    <section className={`resource-notice ${critical ? "critical" : "low"}`} role="status">
      <p>Ресурс на период: {formatPercent(percent)}. Продлите, чтобы не прерываться</p>
      <div>
        <button className="flow-primary" onClick={onRenew}>Продлить</button>
        {!critical && onClose && <button className="flow-ghost" onClick={onClose}>Закрыть</button>}
      </div>
    </section>
  );
}
