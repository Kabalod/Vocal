import { formatRange } from "@/lib/format";
import type { Recommendation } from "@/types/analysis";

const PRIORITY: Record<Recommendation["priority"], string> = {
  high: "Высокий",
  medium: "Средний",
  low: "Низкий",
};

const PRIORITY_CLASS: Record<Recommendation["priority"], string> = {
  high: "text-bad bg-bad/10",
  medium: "text-ok bg-accent-dim",
  low: "text-muted bg-line",
};

export function RecommendationList({ items }: { items: Recommendation[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-2xl">Точки роста</h2>
      <ul className="space-y-3">
        {items.map((item, i) => {
          const range = formatRange(item.startSec, item.endSec);
          return (
            <li
              key={`${item.title}-${i}`}
              id={item.startSec != null ? `rec-${Math.round(item.startSec)}` : undefined}
              className="rounded-2xl border border-line bg-bg-elev p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${PRIORITY_CLASS[item.priority]}`}
                >
                  {PRIORITY[item.priority]}
                </span>
                {range ? (
                  <span className="text-xs text-accent">{range}</span>
                ) : null}
              </div>
              <h3 className="mt-2 font-medium">{item.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{item.detail}</p>
              {item.quote ? (
                <blockquote className="mt-3 border-l-2 border-accent/50 pl-3 text-sm italic text-text/80">
                  «{item.quote}»
                </blockquote>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
