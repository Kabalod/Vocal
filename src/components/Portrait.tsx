import type { PortraitDto } from "@/types/profile";

export function Portrait({
  portrait,
  heading,
  badge,
}: {
  portrait: PortraitDto;
  heading?: string;
  badge?: string;
}) {
  if (portrait.sections.length === 0) return null;
  return (
    <article className="vocal-card min-w-0 overflow-x-hidden p-4 shell:p-6">
      {heading ? (
        <h2 className="font-[family-name:var(--font-display)] text-2xl">{heading}</h2>
      ) : null}
      {badge ? <p className="mt-2 text-sm text-muted">{badge}</p> : null}
      <div className={`${heading ? "mt-4" : ""} space-y-4 font-content text-sm leading-relaxed`}>
        {portrait.sections.map((section) => (
          <section key={section.id} className="min-w-0 space-y-1">
            <h3 className="font-[family-name:var(--font-inter)] text-xs font-semibold uppercase tracking-wide text-accent">
              {section.title}
            </h3>
            <p className="whitespace-pre-wrap break-words">{section.text}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
