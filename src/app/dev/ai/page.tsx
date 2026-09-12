import { notFound } from "next/navigation";
import { isDevUiEnabled } from "@/components/vocal-ui/kit";
import { buildAiUsageReport } from "@/lib/ai/usage-report";

export const dynamic = "force-dynamic";

export default async function DevAiPage() {
  if (!isDevUiEnabled()) notFound();
  const report = await buildAiUsageReport();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl">Сводка AiCall</h1>
        <p className="mt-2 text-sm text-muted">
          Служебная страница. Дневной лимит: {report.dailyLimit || "не задан"}. Сегодня использовано токенов:{" "}
          {report.usedToday}.
        </p>
      </div>
      {report.rows.length === 0 ? (
        <p className="text-sm text-muted">Вызовов модели пока нет.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="py-2 pr-3 font-medium">День</th>
                <th className="py-2 pr-3 font-medium">Контекст</th>
                <th className="py-2 pr-3 font-medium">Вид</th>
                <th className="py-2 pr-3 font-medium">Модель</th>
                <th className="py-2 pr-3 font-medium">Вызовы</th>
                <th className="py-2 pr-3 font-medium">Prompt</th>
                <th className="py-2 pr-3 font-medium">Completion</th>
                <th className="py-2 font-medium">Всего</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr
                  key={`${row.day}-${row.contextType}-${row.contextId}-${row.kind}-${row.model}`}
                  className="border-b border-line"
                >
                  <td className="py-2 pr-3">{row.day}</td>
                  <td className="py-2 pr-3">
                    {row.contextType}
                    {row.contextId ? ` · ${row.contextId}` : ""}
                  </td>
                  <td className="py-2 pr-3">{row.kind}</td>
                  <td className="py-2 pr-3">{row.model}</td>
                  <td className="py-2 pr-3">{row.calls}</td>
                  <td className="py-2 pr-3">{row.promptTokens}</td>
                  <td className="py-2 pr-3">{row.completionTokens}</td>
                  <td className="py-2">{row.totalTokens}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
