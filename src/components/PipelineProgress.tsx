import type { JobStatus } from "@/types/analysis";

const STEPS = [
  { id: "queued", label: "Загрузка" },
  { id: "converting", label: "Конвертация" },
  { id: "transcribing", label: "Распознавание" },
  { id: "analyzing", label: "Анализ" },
] as const;

const ORDER: JobStatus[] = [
  "queued",
  "converting",
  "transcribing",
  "analyzing",
  "done",
];

function stepState(status: JobStatus, stepId: (typeof STEPS)[number]["id"]) {
  if (status === "error") {
    const failedAt = ORDER.indexOf(status);
    const idx = ORDER.indexOf(stepId);
    if (idx < failedAt || (status === "error" && stepId === "queued")) {
      return "done";
    }
  }
  const current = Math.max(ORDER.indexOf(status), 0);
  const idx = ORDER.indexOf(stepId);
  if (status === "done") return "done";
  if (idx < current) return "done";
  if (idx === current) return "active";
  return "todo";
}

export function PipelineProgress({
  status,
  errorMessage,
}: {
  status: JobStatus;
  errorMessage?: string | null;
}) {
  return (
    <div className="space-y-6">
      <ol className="grid gap-3 sm:grid-cols-4">
        {STEPS.map((step) => {
          const state = stepState(status, step.id);
          return (
            <li
              key={step.id}
              className={`rounded-2xl border px-4 py-3 ${
                state === "active"
                  ? "border-accent bg-accent-dim"
                  : state === "done"
                    ? "border-good/30 bg-good/5"
                    : "border-line bg-bg-elev"
              }`}
            >
              <p className="text-[11px] uppercase tracking-wider text-muted">
                {state === "active" ? "сейчас" : state === "done" ? "готово" : "ждём"}
              </p>
              <p className="mt-1 font-medium">{step.label}</p>
            </li>
          );
        })}
      </ol>
      {status === "error" && errorMessage ? (
        <p className="rounded-2xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
