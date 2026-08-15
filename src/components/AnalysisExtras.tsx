import type { NextVideoExercise, StrengthItem, VideoBrief } from "@/types/analysis";

export function VideoBriefCard({ video }: { video: VideoBrief }) {
  const rows = [
    ["Тема", video.topic],
    ["Главная мысль", video.mainIdea],
    ["Аудитория", video.targetAudience],
    ["Формат", video.format],
  ].filter(([, value]) => value);

  if (rows.length === 0) return null;

  return (
    <section className="grid gap-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-line bg-bg-elev p-4">
          <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
          <p className="mt-1 leading-relaxed">{value}</p>
        </div>
      ))}
    </section>
  );
}

export function StrengthsList({ items }: { items: StrengthItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-[family-name:var(--font-display)] text-2xl">Что уже работает</h2>
      <ul className="space-y-3">
        {items.map((item, index) => (
          <li key={`${item.title}-${index}`} className="rounded-2xl border border-line bg-bg-elev p-4">
            <h3 className="font-medium">{item.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">{item.description}</p>
            {item.evidence ? (
              <blockquote className="mt-3 border-l-2 border-good/50 pl-3 text-sm italic text-text/80">
                «{item.evidence}»
              </blockquote>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ExerciseCard({ exercise }: { exercise: NextVideoExercise | null }) {
  if (!exercise) return null;
  return (
    <section className="rounded-3xl border border-accent/30 bg-accent-dim p-5">
      <p className="text-xs uppercase tracking-[0.18em] text-accent">Упражнение на следующее видео</p>
      <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl">{exercise.title}</h2>
      <p className="mt-2 leading-relaxed">{exercise.task}</p>
      {exercise.instruction ? (
        <p className="mt-2 text-sm text-muted">{exercise.instruction}</p>
      ) : null}
      {exercise.successCriteria.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
          {exercise.successCriteria.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
