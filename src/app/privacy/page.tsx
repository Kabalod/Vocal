import type { Metadata } from "next";
import { PrivacyBack } from "@/components/PrivacyBack";
import { Panel } from "@/components/vocal-ui/Panel";
import { feedbackLink } from "@/lib/consent";
import { CONSENT_POINTS, PRIVACY_DRAFT_NOTE, PRIVACY_SECTIONS } from "@/lib/privacy-content";

export const metadata: Metadata = {
  title: "Данные и конфиденциальность — Vocal",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const feedback = feedbackLink(process.env.VOCAL_FEEDBACK_URL);
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] shell:py-10">
      <PrivacyBack />
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl" data-privacy-title>
        Как Vocal работает с вашими данными
      </h1>
      <Panel className="mt-4 text-sm text-muted" data-privacy-draft role="note">
        {PRIVACY_DRAFT_NOTE}
      </Panel>
      <ul className="mt-6 space-y-2 text-base leading-relaxed">
        {CONSENT_POINTS.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      {PRIVACY_SECTIONS.map((section) => (
        <section key={section.id} id={section.id} className="mt-8 space-y-2">
          <h2 className="font-[family-name:var(--font-display)] text-xl">{section.title}</h2>
          {section.items ? (
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph} className="text-sm leading-relaxed text-muted">
              {paragraph}
            </p>
          ))}
          {section.id === "contact" && feedback ? (
            <p className="text-sm">
              <a
                className="inline-flex min-h-11 items-center text-accent-soft"
                href={feedback.href}
                {...(feedback.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                Сообщить о проблеме
              </a>
            </p>
          ) : null}
        </section>
      ))}
    </div>
  );
}
