// Rich-author check (C): a SIMULATED author (a model call through the gateway) with a persona and a hidden story of numbered
// facts answers the service's questions, 40-120 words per answer. The simulator is told nothing about how the service works.
// It answers only from the story, says "не помню / не думал" to anything outside it and prefixes <уже_говорил> when the question
// asks about something already told. This models an author; it does not prove a human author.
//
// Run: DATABASE_URL=$TEST_DATABASE_URL DIRECT_URL=$TEST_DATABASE_URL node --env-file=.env --import tsx scripts/r-live/rich-author.ts \
//        --out=<json> --md=<md> [--max-tokens=600000] [--only=<n>] [--turns=<n>]
// Local test Postgres only. Budget: stops at 80% of --max-tokens (counted from AiCall + simulator usage) and reports "не выполнено".
import { appendFileSync, writeFileSync } from "node:fs";
import { resetPrismaClient } from "../../src/lib/db";
import { closePostgresTestDb, openPostgresTestDb } from "../../tests/helpers/postgres-test-db";

(process.env as { NODE_ENV?: string }).NODE_ENV = "test";
process.env.VOCAL_TAKE_DIAGNOSIS = "1";
process.env.VOCAL_AI_NO_RETRY = "1";

const argOf = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const OUT = argOf("out");
const MD = argOf("md");
const RAW = argOf("raw");
const MAX_TOKENS = Number(argOf("max-tokens") ?? "600000");
const ONLY = argOf("only") ? Number(argOf("only")) : null;
const TURNS_OVERRIDE = argOf("turns") ? Number(argOf("turns")) : null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Persona = { id: string; genre: string; title: string; style: string; opening: string; turns: number; story: string[] };

const PERSONAS: Persona[] = [
  {
    id: "P1", genre: "личная история", title: "Тетради по ночам", turns: 9,
    style: "Марина, 34, учитель русского языка. Говорит тепло и просто, короткими живыми фразами, иногда смеётся над собой.",
    opening: "Я перестала проверять тетради по ночам и впервые за пять лет выспалась.",
    story: [
      "Пять лет подряд я проверяла тетради до двух ночи, потому что боялась, что дети решат, что мне всё равно.",
      "В октябре у меня на уроке дрожали руки: я забыла имя ученика, которого знала три года.",
      "Подруга-врач сказала: если ты не спишь, твои проверки всё равно не читают, ты ставишь отметки на автомате.",
      "Я решила на неделю проверять только по две работы с подробным комментарием, остальные просто смотреть на уроке вместе с классом.",
      "Первые три дня мне было физически тревожно, я два раза вставала ночью проверить хоть одну тетрадь и ложилась обратно.",
      "На пятый день девятиклассник Саша сам принёс исправленное сочинение и сказал, что впервые понял, что у меня написано на полях.",
      "К концу недели я легла в одиннадцать и проснулась без будильника, и в классе заметили, что я больше шучу.",
      "Директор спросила, почему падает количество проверенных тетрадей, а я показала ей, как выросла доля исправленных работ.",
      "Теперь у меня правило: после девяти вечера ни одной тетради, и я говорю об этом ученикам вслух.",
    ],
  },
  {
    id: "P2", genre: "объяснение", title: "Бег через день", turns: 9,
    style: "Андрей, 41, тренер по бегу. Объясняет по делу, любит причины и порядок, приводит цифры, но не выдумывает лишнего.",
    opening: "Бегать каждый день новичку не нужно, и вот почему.",
    story: [
      "Новички думают, что чем чаще бегаешь, тем быстрее прогресс, и бегают каждый день по три километра.",
      "Мышцы и сухожилия адаптируются дольше, чем сердце: сердце привыкает за недели, сухожилия за месяцы.",
      "Именно поэтому на втором месяце у многих болит голень и надкостница, а сердце при этом уже в порядке.",
      "У меня в группе из двенадцати новичков те, кто бегал через день, не бросили ни один, а из тех, кто бегал каждый день, ушли четверо.",
      "Через день значит день бега и день отдыха или лёгкой ходьбы, в день отдыха я прошу пройти пять тысяч шагов.",
      "Темп в первые недели такой, чтобы можно было говорить целыми фразами; если не можешь, замедляйся.",
      "Через шесть недель добавляется третий день, но только если голень не болит утром.",
      "Главная ошибка не частота, а желание проверить себя на скорость в первые две недели.",
      "Моё правило: сначала привычка, потом объём, потом скорость, и никогда в обратном порядке.",
    ],
  },
  {
    id: "P3", genre: "рассуждение с советом", title: "Не соглашайтесь на любую цену", turns: 9,
    style: "Ольга, 29, фрилансер-дизайнер. Рассуждает вслух, делает выводы, в конце любит давать совет, но сначала приводит свой случай.",
    opening: "Я долго думала, что отказ от дешёвого заказа это потеря, а оказалось наоборот.",
    story: [
      "Первые два года я брала любые заказы, даже за половину цены, потому что боялась остаться без работы.",
      "В марте я взяла логотип за три тысячи, который съел у меня четыре дня и две правки в выходные.",
      "Клиентка потом написала, что логотип ей нужен для обычного проекта на пару недель, и пропала.",
      "В тот же месяц мне написала студия с нормальным бюджетом, а я не успела, потому что была занята тем логотипом.",
      "Я посчитала, что за полгода дешёвые заказы дали мне ноль денег в пересчёте на час и ноль портфолио.",
      "Теперь у меня минимальная цена, я называю её сразу и не торгуюсь, и первые две недели это было страшно.",
      "За месяц меня отшили шесть человек, но один из них вернулся через неделю и согласился на мою цену.",
      "Мой вывод: вместо того чтобы бояться потерять заказ, надо заранее решить, ниже какой цены работа вас разрушает.",
      "Совет начинающим: запишите цифру на бумаге и повесьте над столом, и не меняйте её в ответ на первое же «дорого».",
    ],
  },
  {
    id: "P4", genre: "говорливый с отступлениями", title: "Рынок и сметана", turns: 10,
    style: "Игорь, 52, повар. Очень говорливый, постоянно уходит в сторону (рассказывает про соседей, про прошлую работу, про погоду), но к сути возвращается сам.",
    opening: "Я начал ходить на рынок в шесть утра и стал меньше выбрасывать продуктов.",
    story: [
      "Раньше я закупал продукты раз в неделю по списку и в конце недели выбрасывал треть: зелень, сметану, овощи.",
      "С марта хожу на рынок к шести утра по вторникам и четвергам и беру только на два дня.",
      "К шести утра там тихо, и продавцы сами рассказывают, что привезли сегодня, а что вчерашнее.",
      "Тётя Люба на углу торгует сметаной, и она сказала мне не брать банку, а брать развесную, потому что в банке она жидкая.",
      "Первые две недели я всё равно переплатил: купил двойную порцию форели, потому что она была красивая.",
      "Теперь я сначала смотрю, что есть, и только потом решаю, что готовить, а не наоборот.",
      "Выбрасываю теперь примерно одну десятую, я считал по весу мусорного ведра.",
      "Жена заметила, что на столе стало больше сезонного: в апреле редис и щавель, в мае спаржа.",
      "Главное, что я понял: список по рецепту работает, пока ты не видишь продукт, а на рынке продукт важнее списка.",
    ],
  },
  {
    id: "P5", genre: "сдержанный, но подробный", title: "Ночные смены", turns: 8,
    style: "Лена, 38, медсестра. Говорит сухо, без эмоций и оценок, но очень подробно: даты, цифры, последовательность действий. Не философствует.",
    opening: "Я перешла с ночных смен на дневные и расскажу, что изменилось.",
    story: [
      "Семь лет я работала в ночь, график два через два, с восьми вечера до восьми утра.",
      "В августе прошлого года у меня в течение недели три раза подряд поднималось давление до 150 на 95 утром после смены.",
      "Врач сказал, что дело не в давлении как таковом, а в том, что я ни разу за семь лет не спала больше пяти часов подряд днём.",
      "Я написала заявление на перевод в дневную смену, ждала его семь недель, потому что не было свободного места.",
      "В первые две недели на дневной смене я просыпалась в три часа ночи сама, по привычке, и не могла уснуть.",
      "Я стала ложиться в десять и выключать телефон за час до сна, и на четвёртой неделе проспала восемь часов.",
      "Зарплата упала примерно на двадцать процентов из-за надбавок за ночь, и мы с мужем пересчитали бюджет.",
      "Давление за три месяца ни разу не вышло выше 130 на 85.",
      "Я не жалею, но по ночам иногда скучаю по тишине в отделении.",
    ],
  },
  {
    id: "P6", genre: "произвольный: юмор о путешествии", title: "Поезд без розетки", turns: 8,
    style: "Саша, 26, любит смешные бытовые истории. Говорит с иронией, преувеличивает по мелочи, но факты не выдумывает.",
    opening: "Я решил проехать двое суток на поезде без телефона, потому что в вагоне не оказалось розетки.",
    story: [
      "Я ехал из Москвы в Новосибирск на поезде, и в плацкарте розетка оказалась сломана.",
      "Телефон сел к вечеру первого дня, и я остался с книгой, которую взял в дорогу для вида.",
      "Соседкой по купе была бабушка с огромной сумкой, и в первый вечер она угостила меня варёной картошкой с огурцом.",
      "Я рассказал ей, чем занимаюсь, и она спросила, что это за профессия, при которой не нужно ходить на работу.",
      "На вторые сутки я сыграл с проводником в нарды на станции в Омске, и проиграл три раза подряд.",
      "Ночью я проснулся от того, что никто не листал ленту, и впервые заметил, как стучат колёса.",
      "К Новосибирску я прочитал всю книгу и записал в ней адрес бабушки, чтобы отправить открытку.",
      "Открытку я отправил, и она ответила, что картошка была не варёная, а запечённая.",
    ],
  },
];

const SIM_SYSTEM = [
  "Ты играешь роль автора коротких видео, которого расспрашивают о его мысли. Ты ничего не знаешь о том, кто и как тебя расспрашивает.",
  "Отвечай по-русски, от первого лица, живой речью, от 40 до 120 слов на один ответ.",
  "Отвечай только из своей истории (пронумерованные факты). Если вопрос про то, чего в истории нет, скажи, что не помнишь или не думал об этом, и больше ничего не выдумывай.",
  "Если вопрос спрашивает о том, что ты уже рассказал, начни ответ с метки <уже_говорил> и ответь кратко.",
  "Если тебя спрашивают, готов ли ты закончить или собрать результат, ответь согласием одной короткой фразой.",
  'Верни JSON: {"answer":"…","used_facts":[номера фактов, которые ты использовал в этом ответе]}.',
].join("\n");

const words = (text: string): string[] => text.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 4);
const containment = (part: string, whole: string): number => {
  const a = new Set(words(part));
  const b = new Set(words(whole));
  if (a.size === 0) return 1;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return shared / a.size;
};
const sentences = (text: string): string[] => text.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter((s) => words(s).length >= 4);

async function main() {
  const db = await openPostgresTestDb();
  await resetPrismaClient();
  const { prisma } = db;
  const { createThoughtFromText } = await import("../../src/lib/thought-create");
  const { sendDialogueMessage } = await import("../../src/lib/dialogue");
  const { generateV05Script, evaluateScriptReadiness } = await import("../../src/lib/v05-script");
  const { getThoughtState } = await import("../../src/lib/thought-state");
  const { defaultCompleteJson } = await import("../../src/lib/ai/complete");

  const stats = { attempts: 0, failures: [] as { status: number | string; retried: boolean; who: string }[], simTokens: 0, simCalls: 0 };
  let currentWho = "";
  let lastDialoguePrompt = "";
  const wrap = (who: "service" | "author") => async (args: Parameters<typeof defaultCompleteJson>[0]) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      stats.attempts += 1;
      try {
        const result = await defaultCompleteJson(args);
        if (who === "author") {
          stats.simCalls += 1;
          stats.simTokens += (result.usage?.promptTokens ?? 0) + (result.usage?.completionTokens ?? 0);
        } else if (args.label === "dialogue") {
          lastDialoguePrompt = args.user;
        }
        if (RAW && who === "service") appendFileSync(RAW, JSON.stringify({ dialogue: currentWho, label: args.label ?? "chat", text: result.text }) + "\n");
        return result;
      } catch (error) {
        const e = error as { status?: number; message?: string; headers?: Record<string, string> };
        const status = e.status ?? "none";
        const retryable = status === 429 || (typeof status === "number" && status >= 500) || /вовремя|timeout|timed out/i.test(String(e.message ?? ""));
        stats.failures.push({ status, retried: retryable && attempt === 0, who });
        console.warn(`provider failure (${who}): status=${status} retry=${retryable && attempt === 0}`);
        if (!retryable || attempt === 1) throw error;
        const ra = Number(e.headers?.["retry-after"]);
        await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 120) * 1000 + 750 : 20_000);
      }
    }
    throw new Error("unreachable");
  };
  const service = wrap("service");
  const author = wrap("author");
  const aiTokens = async () => (await prisma.aiCall.findMany({ select: { promptTokens: true, completionTokens: true } })).reduce((a, r) => a + (r.promptTokens ?? 0) + (r.completionTokens ?? 0), 0);
  const spent = async () => (await aiTokens()) + stats.simTokens;

  const results: Record<string, unknown>[] = [];
  const md: string[] = ["# Развёрнутый автор: диалоги целиком", "", "Автор в этих диалогах **смоделирован** (вызов модели с персонажем и скрытой историей); живого человека это не доказывает. Скрытая история каждого персонажа приведена в конце его диалога для чтения.", ""];
  let notExecuted = false;

  for (const persona of PERSONAS) {
    if (ONLY && Number(persona.id.slice(1)) !== ONLY) continue;
    if ((await spent()) > MAX_TOKENS * 0.8) {
      notExecuted = true;
      results.push({ persona: persona.id, notExecuted: true, reason: "80% of the run budget reached" });
      md.push(`## ${persona.id}. ${persona.title}`, "", "_Не выполнено: достигнуто 80% бюджета прогона._", "");
      continue;
    }
    currentWho = persona.id;
    const startTokens = await aiTokens();
    const startSim = stats.simTokens;
    const made = await createThoughtFromText({ title: persona.title, body: persona.opening, idempotencyKey: `rich-${persona.id}` });
    const reelId = made.reel.id;
    const turnsTarget = TURNS_OVERRIDE ?? persona.turns;
    const told = new Set<number>();
    const usedByAnswer: number[][] = [];
    const history: { q: string; a: string }[] = [];
    let alreadySaid = 0;
    let firstOfferTurn: number | null = null;
    let notDone = 0;
    let acceptedOffer = false;
    let userText = "уточни";
    md.push(`## ${persona.id}. ${persona.genre}: «${persona.title}»`, "", `_Персонаж: ${persona.style}_`, "", `**Первое сообщение (дубль):** ${persona.opening}`, "");
    for (let turn = 1; turn <= turnsTarget; turn += 1) {
      try {
        await sendDialogueMessage(reelId, { text: userText, idempotencyKey: `rich-${persona.id}-t${turn}` }, service as never);
      } catch {
        notDone += 1;
      }
      const thread = await prisma.dialogueThread.findUnique({ where: { reelId } });
      const rows = thread ? await prisma.dialogueMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: "asc" } }) : [];
      const lastUser = [...rows].reverse().find((r) => r.role === "user");
      const lastAssistant = [...rows].reverse().find((r) => r.role === "assistant");
      const lastMarks = (() => { try { return ((JSON.parse(lastAssistant?.payloadJson ?? "{}") as { discardedUpdates?: string[] }).discardedUpdates ?? []); } catch { return []; } })();
      if (firstOfferTurn === null && lastMarks.includes("policy_understanding_offer")) firstOfferTurn = turn;
      const question = lastAssistant?.status === "done" ? lastAssistant.body : "";
      if (!question || turn === turnsTarget) break;
      // the simulated author answers
      const recent = history.slice(-5).map((h) => `Ведущий: ${h.q}\nТы: ${h.a}`).join("\n\n");
      const simUser = [
        `Твоя история:\n${persona.story.map((f, i) => `${i + 1}. ${f}`).join("\n")}`,
        `Твой характер и манера: ${persona.style}`,
        recent ? `Разговор до сих пор:\n${recent}` : "",
        `Новый вопрос ведущего: ${question}`,
      ].filter(Boolean).join("\n\n");
      let answer = "";
      let used: number[] = [];
      try {
        const sim = await author({ model: (await import("../../src/lib/ai/complete")).LLM_MODEL as string, system: SIM_SYSTEM, user: simUser, label: "chat" } as never);
        const parsed = JSON.parse(sim.text) as { answer?: string; used_facts?: number[] };
        answer = String(parsed.answer ?? "").trim();
        used = (parsed.used_facts ?? []).filter((n) => Number.isInteger(n));
      } catch {
        notDone += 1;
      }
      if (!answer) { userText = "Не знаю."; used = []; } else userText = answer.replace(/^<уже_говорил>\s*/i, "").trim() || answer;
      if (/^<уже_говорил>/i.test(answer)) alreadySaid += 1;
      if (/Собрать сценарий\?/.test(question) && !acceptedOffer) { acceptedOffer = true; }
      history.push({ q: question, a: answer || "(нет ответа)" });
      usedByAnswer.push(used);
      for (const n of used) told.add(n);
      await sleep(1500 + Math.floor(Math.random() * 1000));
    }

    // Build the script once.
    let scriptStatus = "";
    let scriptText = "";
    let changes: string[] = [];
    try {
      const ready = await evaluateScriptReadiness(reelId);
      if (!ready.ready) scriptStatus = `not_ready: ${ready.blockReason}`;
      else {
        const ws = await generateV05Script(reelId, { idempotencyKey: `rich-${persona.id}-script` }, service as never);
        scriptStatus = `ok(changes=${ws.viewingChanges.length})`;
        scriptText = ws.viewing?.body ?? ws.draft?.body ?? "";
        changes = ws.viewingChanges.map((c: unknown) => (typeof c === "string" ? c : JSON.stringify(c)));
      }
    } catch (error) {
      scriptStatus = `error: ${(error as { code?: string }).code ?? "error"}`;
    }

    // Metrics from the stored data
    const thread = await prisma.dialogueThread.findUnique({ where: { reelId } });
    const rows = thread ? await prisma.dialogueMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: "asc" } }) : [];
    const state = await getThoughtState(reelId);
    const userRows = rows.filter((r) => r.role === "user");
    const assistantRows = rows.filter((r) => r.role === "assistant");
    const marksOf = (r: { payloadJson: string }) => { try { return ((JSON.parse(r.payloadJson) as { discardedUpdates?: string[] }).discardedUpdates ?? []); } catch { return []; } };
    const allMarks = assistantRows.flatMap(marksOf);
    const answers = userRows.slice(1); // the first message is the command
    const answerText = answers.map((r) => r.body).join(" ");
    // told facts by answer index (answers[i] is the reply to turn i+1)
    const acceptedBy = new Set(state.facts.map((f) => f.sourceId));
    const acceptedFactNumbers = new Set<number>();
    answers.forEach((row, i) => {
      if (acceptedBy.has(row.id)) for (const n of usedByAnswer[i] ?? []) acceptedFactNumbers.add(n);
    });
    const invented = state.facts.filter((f) => {
      const src = userRows.find((r) => r.id === f.sourceId);
      return !src || containment(f.text, src.body) < 0.8;
    }).length;
    const earlyFacts = state.facts.slice(0, 3);
    const inPrompt = earlyFacts.filter((f) => lastDialoguePrompt.includes(f.text)).length;
    const sentencesOfAuthor = sentences(answerText);
    const preserved = scriptText ? sentencesOfAuthor.filter((s) => containment(s, scriptText) >= 0.7).length : 0;
    const scriptSentences = sentences(scriptText);
    const authorCorpus = `${persona.opening} ${answerText}`;
    const newContent = scriptSentences.filter((s) => containment(s, authorCorpus) < 0.5);
    const traced = changes.filter((c) => containment(c, `${authorCorpus} ${scriptText}`) >= 0.5).length;
    const qCount = assistantRows.filter((r) => r.kind === "question" && r.status === "done").length;
    const dialogueTokens = (await aiTokens()) - startTokens;
    const simTokens = stats.simTokens - startSim;
    results.push({
      persona: persona.id, genre: persona.genre, turns: userRows.length, questions: qCount,
      firstOfferTurn, reachedOffer: firstOfferTurn !== null, alreadySaidAnswers: alreadySaid,
      hiddenFacts: persona.story.length, toldByAuthor: told.size, acceptedFactsInState: state.facts.length, coveredHiddenFacts: acceptedFactNumbers.size,
      inventedFacts: invented, drynessHints: allMarks.filter((m) => m === "policy_dryness_hint").length,
      noMaterialNotices: allMarks.filter((m) => m === "policy_no_fact_notice").length,
      endAsks: allMarks.filter((m) => m === "policy_end_ask").length,
      earlyFactsInLastPrompt: `${inPrompt}/${earlyFacts.length}`,
      scriptStatus, scriptWords: scriptText.split(/\s+/).filter(Boolean).length,
      authorSentences: sentencesOfAuthor.length, preservedInScript: preserved,
      changes: changes.length, changesTraced: traced, newSentencesInScript: newContent.length,
      discarded: allMarks.reduce<Record<string, number>>((a, m) => ((a[m] = (a[m] ?? 0) + 1), a), {}),
      notExecutedCalls: notDone, serviceTokens: dialogueTokens, simulatorTokens: simTokens,
      tokensPerTurn: Math.round(dialogueTokens / Math.max(1, userRows.length)),
    });
    md.push(...rows.filter((r) => r.role === "user" || r.status !== "processing").map((r) => (r.role === "user" ? `**Автор:** ${r.body}` : r.status === "error" ? `**Vocal** [ошибка хода]: ${r.body}` : `**Vocal** (${r.kind}): ${r.body}`)).flatMap((l) => [l, ""]));
    md.push(`_Сборка сценария: ${scriptStatus}_`, "");
    if (scriptText) md.push("**Сценарий:**", "", scriptText, "", ...(changes.length ? ["**Что изменено:**", ...changes.map((c) => `- ${c}`), ""] : []));
    md.push("**Скрытая история автора (для чтения владельцем):**", ...persona.story.map((f, i) => `${i + 1}. ${f}`), "");
  }

  const total = await spent();
  const summary = { notExecuted, maxTokens: MAX_TOKENS, spentTokens: total, aiCallTokens: await aiTokens(), simulatorTokens: stats.simTokens, simulatorCalls: stats.simCalls, providerAttempts: stats.attempts, failures: stats.failures, results };
  if (MD) writeFileSync(MD, md.join("\n"));
  if (OUT) writeFileSync(OUT, JSON.stringify(summary, null, 1));
  console.log(JSON.stringify(summary, null, 1));
  await closePostgresTestDb(db);
}
main().then(() => process.exit(0)).catch((error) => { console.error("rich-author failed:", error instanceof Error ? error.message.slice(0, 300) : "error"); process.exit(1); });
