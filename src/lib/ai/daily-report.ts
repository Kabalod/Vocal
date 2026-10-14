/**
 * L1: the daily spend report from AiCall (no prompt or response text is read). Per user, per kind of action, STT apart, and the day's
 * total against the provider's daily token limit. The day is the server's local calendar day (as in usage-guard.ts); the provider's
 * window is a rolling 24 hours, so the report also gives the last 24 hours.
 */
import { prisma } from "@/lib/db";
import { dailySttSecondsLimit, dailyTokenLimit, globalDailyTokenCap, STT_CALL_KIND } from "@/lib/ai/usage-guard";

export const DEFAULT_PROVIDER_DAILY_TOKEN_LIMIT = 200_000;

/** The provider's daily token limit (Groq free tier: 200 000 per account). Used only by this report, never to enforce anything. */
export function providerDailyTokenLimit(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.VOCAL_PROVIDER_DAILY_TOKEN_LIMIT?.trim());
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_PROVIDER_DAILY_TOKEN_LIMIT;
}

export type CallRow = {
  kind: string;
  status: string;
  ownerUserId: string;
  promptTokens: number | null;
  completionTokens: number | null;
  createdAt: Date;
};

export type KindTotals = { kind: string; calls: number; errors: number; promptTokens: number; completionTokens: number; totalTokens: number };
export type UserTotals = {
  ownerUserId: string;
  calls: number;
  errors: number;
  chatTokens: number;
  sttSeconds: number;
  sttCalls: number;
  tokenLimit: number;
  sttLimit: number;
  tokenLimitUsedPercent: number | null;
  byKind: KindTotals[];
};
export type DailyReport = {
  day: string;
  generatedAt: string;
  limits: { providerDailyTokens: number; globalDailyTokenCap: number; perUserDailyTokens: number; perUserDailySttSeconds: number };
  /** Chat tokens (done + error), all users, the calendar day. STT is not tokens and is not included. */
  chatTokensDay: number;
  chatTokensLast24h: number;
  providerUsedPercentDay: number | null;
  providerUsedPercentLast24h: number | null;
  sttSecondsDay: number;
  sttCallsDay: number;
  callsDay: number;
  errorsDay: number;
  /** Calls counted in the day that have no token numbers (queued or failed before the provider answered). */
  callsWithoutTokens: number;
  byKind: KindTotals[];
  byUser: UserTotals[];
  byStatus: { status: string; calls: number }[];
};

export function localDayStart(day?: string, now = new Date()): Date {
  if (day) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    if (!match) throw new Error(`Bad day "${day}", expected YYYY-MM-DD.`);
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (Number.isNaN(date.getTime())) throw new Error(`Bad day "${day}".`);
    return date;
  }
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function dayLabel(start: Date): string {
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
}

const percent = (value: number, limit: number): number | null => (limit > 0 ? Math.round((value / limit) * 1000) / 10 : null);
const counted = (row: CallRow) => row.status === "done" || row.status === "error";
const tokens = (row: CallRow) => (row.promptTokens ?? 0) + (row.completionTokens ?? 0);

/** Pure: rows of the day (and, for the rolling window, of the 24 hours before `now`) → report. */
export function buildDailyReport(
  dayRows: CallRow[],
  last24hRows: CallRow[],
  options: { day: string; now?: Date; env?: Record<string, string | undefined> },
): DailyReport {
  const env = options.env ?? process.env;
  const providerLimit = providerDailyTokenLimit(env);
  const perUserLimit = dailyTokenLimit();
  const sttLimit = dailySttSecondsLimit();

  const kinds = new Map<string, KindTotals>();
  const users = new Map<string, UserTotals & { kinds: Map<string, KindTotals> }>();
  const statuses = new Map<string, number>();
  let chatTokensDay = 0;
  let sttSecondsDay = 0;
  let sttCallsDay = 0;
  let errorsDay = 0;
  let callsWithoutTokens = 0;

  const bump = (map: Map<string, KindTotals>, row: CallRow) => {
    const entry = map.get(row.kind) ?? { kind: row.kind, calls: 0, errors: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    entry.calls += 1;
    if (row.status === "error") entry.errors += 1;
    if (row.kind !== STT_CALL_KIND) {
      entry.promptTokens += row.promptTokens ?? 0;
      entry.completionTokens += row.completionTokens ?? 0;
      entry.totalTokens += tokens(row);
    } else {
      // STT keeps audio seconds in promptTokens: reported as seconds below, never mixed into tokens
      entry.promptTokens += row.promptTokens ?? 0;
    }
    map.set(row.kind, entry);
  };

  for (const row of dayRows) {
    const user = users.get(row.ownerUserId) ?? {
      ownerUserId: row.ownerUserId, calls: 0, errors: 0, chatTokens: 0, sttSeconds: 0, sttCalls: 0,
      tokenLimit: perUserLimit, sttLimit, tokenLimitUsedPercent: null, byKind: [], kinds: new Map<string, KindTotals>(),
    };
    user.calls += 1;
    statuses.set(row.status, (statuses.get(row.status) ?? 0) + 1);
    if (row.status === "error") { user.errors += 1; errorsDay += 1; }
    if (row.promptTokens === null && row.completionTokens === null) callsWithoutTokens += 1;
    bump(kinds, row);
    bump(user.kinds, row);
    if (row.kind === STT_CALL_KIND) {
      user.sttCalls += 1;
      sttCallsDay += 1;
      user.sttSeconds += row.promptTokens ?? 0;
      sttSecondsDay += row.promptTokens ?? 0;
    } else if (counted(row)) {
      user.chatTokens += tokens(row);
      chatTokensDay += tokens(row);
    }
    users.set(row.ownerUserId, user);
  }

  const chatTokensLast24h = last24hRows.filter((row) => row.kind !== STT_CALL_KIND && counted(row)).reduce((sum, row) => sum + tokens(row), 0);
  const byUser = [...users.values()]
    .map(({ kinds: userKinds, ...user }) => ({
      ...user,
      tokenLimitUsedPercent: percent(user.chatTokens, perUserLimit),
      byKind: [...userKinds.values()].sort((a, b) => b.totalTokens - a.totalTokens),
    }))
    .sort((a, b) => b.chatTokens - a.chatTokens);

  return {
    day: options.day,
    generatedAt: (options.now ?? new Date()).toISOString(),
    limits: { providerDailyTokens: providerLimit, globalDailyTokenCap: globalDailyTokenCap(env), perUserDailyTokens: perUserLimit, perUserDailySttSeconds: sttLimit },
    chatTokensDay,
    chatTokensLast24h,
    providerUsedPercentDay: percent(chatTokensDay, providerLimit),
    providerUsedPercentLast24h: percent(chatTokensLast24h, providerLimit),
    sttSecondsDay,
    sttCallsDay,
    callsDay: dayRows.length,
    errorsDay,
    callsWithoutTokens,
    byKind: [...kinds.values()].sort((a, b) => b.totalTokens - a.totalTokens),
    byUser,
    byStatus: [...statuses.entries()].map(([status, calls]) => ({ status, calls })).sort((a, b) => b.calls - a.calls),
  };
}

/** Reads only the columns the report needs; never promptText, responseText or any snapshot. */
export async function loadDailyReport(options: { day?: string; now?: Date } = {}): Promise<DailyReport> {
  const now = options.now ?? new Date();
  const start = localDayStart(options.day, now);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const select = { kind: true, status: true, ownerUserId: true, promptTokens: true, completionTokens: true, createdAt: true } as const;
  const dayRows = await prisma.aiCall.findMany({ where: { createdAt: { gte: start, lt: end } }, select, orderBy: { createdAt: "asc" } });
  const windowEnd = now < end ? now : end; // today: the 24 hours up to now; a past day: the 24 hours that end with it
  const last24h = await prisma.aiCall.findMany({ where: { createdAt: { gte: new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000), lt: windowEnd } }, select });
  return buildDailyReport(dayRows, last24h, { day: dayLabel(start), now });
}

const fmt = (n: number) => n.toLocaleString("ru-RU").replace(/ /g, " ");
const pct = (value: number | null) => (value === null ? "—" : `${value}%`);

export function renderDailyReportMarkdown(report: DailyReport): string {
  const l = report.limits;
  const lines: string[] = [];
  lines.push(`# Расход модели за ${report.day}`, "", `Сформирован: ${report.generatedAt}. Сутки — календарный день по времени сервера; окно провайдера скользящее (24 часа). Тексты запросов и ответов в отчёт не попадают.`, "");
  lines.push("## Итог против лимита провайдера", "");
  lines.push("| Показатель | Значение |", "|---|---|");
  lines.push(`| Токены чата за календарный день (все пользователи) | ${fmt(report.chatTokensDay)} из ${fmt(l.providerDailyTokens)} (${pct(report.providerUsedPercentDay)}) |`);
  lines.push(`| Токены чата за последние 24 часа | ${fmt(report.chatTokensLast24h)} из ${fmt(l.providerDailyTokens)} (${pct(report.providerUsedPercentLast24h)}) |`);
  lines.push(`| Глобальный выключатель \`VOCAL_GLOBAL_DAILY_TOKEN_CAP\` | ${l.globalDailyTokenCap > 0 ? fmt(l.globalDailyTokenCap) : "выключен (0)"} |`);
  lines.push(`| Лимит на человека \`VOCAL_DAILY_TOKEN_LIMIT\` | ${l.perUserDailyTokens > 0 ? fmt(l.perUserDailyTokens) : "выключен (0)"} |`);
  lines.push(`| Расшифровка голоса (отдельно, секунды звука) | ${fmt(report.sttSecondsDay)} с в ${report.sttCallsDay} вызовах; лимит на человека ${l.perUserDailySttSeconds > 0 ? fmt(l.perUserDailySttSeconds) + " с" : "выключен"} |`);
  lines.push(`| Вызовов всего / с ошибкой / без чисел токенов | ${report.callsDay} / ${report.errorsDay} / ${report.callsWithoutTokens} |`);
  lines.push("", "Считаются вызовы со статусом `done` и `error` (как в лимитах приложения). Вызовы в очереди и без чисел токенов в итог токенов не входят.", "");
  lines.push("## По пользователям", "");
  if (report.byUser.length === 0) lines.push("Вызовов за день нет.", "");
  else {
    lines.push("| Пользователь | Вызовов | Ошибок | Токены чата | % лимита на человека | STT, с |", "|---|---:|---:|---:|---:|---:|");
    for (const u of report.byUser) lines.push(`| \`${u.ownerUserId}\` | ${u.calls} | ${u.errors} | ${fmt(u.chatTokens)} | ${pct(u.tokenLimitUsedPercent)} | ${fmt(u.sttSeconds)} |`);
    lines.push("");
  }
  lines.push("## По типу действия", "", "| kind | Вызовов | Ошибок | Запрос | Ответ | Всего токенов |", "|---|---:|---:|---:|---:|---:|");
  for (const k of report.byKind.filter((item) => item.kind !== STT_CALL_KIND)) lines.push(`| ${k.kind} | ${k.calls} | ${k.errors} | ${fmt(k.promptTokens)} | ${fmt(k.completionTokens)} | ${fmt(k.totalTokens)} |`);
  lines.push("", "## Расшифровка голоса (STT), отдельно", "", `Вызовов: ${report.sttCallsDay}; секунд звука: ${fmt(report.sttSecondsDay)}. Это не токены, в итог токенов не входит.`, "");
  lines.push("## По типу действия у каждого пользователя", "");
  for (const u of report.byUser) {
    lines.push(`**\`${u.ownerUserId}\`**`, "", "| kind | Вызовов | Токены |", "|---|---:|---:|");
    for (const k of u.byKind) lines.push(`| ${k.kind} | ${k.calls} | ${k.kind === STT_CALL_KIND ? `${fmt(k.promptTokens)} с` : fmt(k.totalTokens)} |`);
    lines.push("");
  }
  lines.push("## По статусам", "", "| status | Вызовов |", "|---|---:|");
  for (const s of report.byStatus) lines.push(`| ${s.status} | ${s.calls} |`);
  lines.push("");
  return lines.join("\n");
}
