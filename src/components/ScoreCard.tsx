import { scoreTone } from "@/lib/format";
import type { CategoryScore, CriterionEvaluation } from "@/types/analysis";

function toneClass(score: number) {
  const tone = scoreTone(score);
  if (tone === "good") return "text-good";
  if (tone === "ok") return "text-ok";
  return "text-bad";
}

export function ScoreCard({
  overall,
  categories,
  evaluations,
}: {
  overall: number;
  categories: CategoryScore[];
  evaluations: CriterionEvaluation[];
}) {
  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-line bg-bg-elev px-6 py-8">
        <p className="text-sm text-muted">Итоговый балл</p>
        <p className={`mt-1 font-[family-name:var(--font-display)] text-6xl ${toneClass(overall)}`}>
          {overall.toFixed(1)}
          <span className="ml-1 text-2xl text-muted">/10</span>
        </p>
        <p className="mt-3 max-w-xl text-sm text-muted">
          Считается на бэкенде: средняя по категориям с их весами. В категории входят только
          применимые критерии.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => (
          <article key={category.id} className="rounded-2xl border border-line bg-bg-elev p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-medium">{category.label}</h3>
              <span className={`text-lg font-semibold ${toneClass(category.score)}`}>
                {category.score.toFixed(1)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">вес категории {category.weight}</p>
          </article>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {evaluations.map((item) => (
          <article key={item.id} className="rounded-2xl border border-line bg-bg-elev p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-medium">{item.name}</h3>
              {item.applicable ? (
                <span className={`text-lg font-semibold ${toneClass(item.score)}`}>
                  {item.score}
                </span>
              ) : (
                <span className="text-xs uppercase tracking-wide text-muted">неприменимо</span>
              )}
            </div>
            {item.analysis ? (
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.analysis}</p>
            ) : null}
            {item.evidence[0]?.quote ? (
              <blockquote className="mt-3 border-l-2 border-accent/40 pl-3 text-sm italic text-text/80">
                «{item.evidence[0].quote}»
              </blockquote>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
