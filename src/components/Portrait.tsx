import type { PortraitDto } from "@/types/profile";

export function Portrait({ portrait }: { portrait: PortraitDto }) {
  if (portrait.sections.length === 0) return null;
  return (
    <div className="space-y-4">
      {portrait.sections.map((section) => (
        <section key={section.id} className="space-y-2 rounded-2xl border border-line bg-bg-elev p-4">
          <h2 className="font-medium">{section.title}</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{section.text}</p>
        </section>
      ))}
    </div>
  );
}
