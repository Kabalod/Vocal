import { formatRange } from "@/lib/format";
import type {
  CoachPack,
  CraftTip,
  NextVideoExercise,
  StrengthItem,
  VideoBrief,
} from "@/types/analysis";

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

const AREA_LABEL: Record<CraftTip["area"], string> = {
  idea: "Идея",
  style: "Стиль",
  delivery: "Подача текста",
};

export function CoachPanel({ coach }: { coach: CoachPack | null }) {
  if (!coach) return null;
  const { scenario, craft } = coach;
  const hasScenario =
    scenario.spine ||
    scenario.openingRewrite ||
    scenario.endingRewrite ||
    scenario.weakBeats.length > 0;
  if (!hasScenario && craft.length === 0) return null;

  return (
    <section className="space-y-5">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-accent">Помощник на следующий дубль</p>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl">
          Как улучшить, не трогая исходник
        </h2>
        <p className="mt-2 text-sm text-muted">
          Видео не режем. Ниже — что пересказать иначе: слабые куски сценария, идея, стиль
          речи и порядок мыслей.
        </p>
      </div>

      {scenario.spine ? (
        <div className="rounded-3xl border border-accent/30 bg-accent-dim p-5">
          <p className="text-xs uppercase tracking-wide text-accent">Хребет ролика</p>
          <p className="mt-2 text-lg leading-relaxed">{scenario.spine}</p>
        </div>
      ) : null}

      {scenario.weakBeats.length > 0 ? (
        <div className="space-y-3">
          <h3 className="font-medium">Слабые места сценария</h3>
          <ul className="space-y-3">
            {scenario.weakBeats.map((beat, index) => {
              const range = formatRange(beat.startSec, beat.endSec);
              return (
                <li key={`${beat.problem}-${index}`} className="rounded-2xl border border-line bg-bg-elev p-4">
                  <div className="flex flex-wrap gap-2 text-xs text-muted">
                    {range ? <span className="text-accent">{range}</span> : null}
                    <span>переписать в следующем дубле</span>
                  </div>
                  {beat.quote ? (
                    <blockquote className="mt-2 border-l-2 border-bad/40 pl-3 text-sm italic">
                      «{beat.quote}»
                    </blockquote>
                  ) : null}
                  <p className="mt-2 text-sm text-muted">{beat.problem}</p>
                  <p className="mt-2 text-sm leading-relaxed">{beat.suggestion}</p>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {scenario.openingRewrite ? (
          <article className="rounded-2xl border border-line bg-bg-elev p-4">
            <p className="text-xs uppercase tracking-wide text-muted">Новое начало</p>
            <p className="mt-2 leading-relaxed">{scenario.openingRewrite}</p>
          </article>
        ) : null}
        {scenario.endingRewrite ? (
          <article className="rounded-2xl border border-line bg-bg-elev p-4">
            <p className="text-xs uppercase tracking-wide text-muted">Новый финал</p>
            <p className="mt-2 leading-relaxed">{scenario.endingRewrite}</p>
          </article>
        ) : null}
      </div>

      {craft.length > 0 ? (
        <div className="space-y-3">
          <h3 className="font-medium">Идея, стиль, подача</h3>
          <ul className="space-y-3">
            {craft.map((tip, index) => (
              <li key={`${tip.title}-${index}`} className="rounded-2xl border border-line bg-bg-elev p-4">
                <p className="text-xs uppercase tracking-wide text-accent">{AREA_LABEL[tip.area]}</p>
                <h4 className="mt-1 font-medium">{tip.title}</h4>
                {tip.now ? <p className="mt-2 text-sm text-muted">Сейчас: {tip.now}</p> : null}
                <p className="mt-1 text-sm leading-relaxed">{tip.better}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
