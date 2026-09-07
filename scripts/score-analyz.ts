import fs from "fs";
import path from "path";
import { DEFAULT_CRITERIA } from "../src/lib/framework";
import { normalizeFormat } from "../src/lib/playbook";
import { applyFormatApplicability, overallFromCategories, scoreCategories } from "../src/lib/scoring";
import { stripWhisperCredits } from "../src/lib/stt-clean";
import type { CriterionEvaluation } from "../src/types/analysis";

const dir = "D:/Vocal/Analyz/SirDenisov";

function clip(n: number) {
  return Math.max(0, Math.min(10, Math.round(n)));
}

function toks(text: string) {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^a-zа-я0-9-]+/i)
    .filter(Boolean);
}

function firstSent(text: string) {
  return (text.trim().split(/(?<=[.!?…])\s+/)[0] || text.trim()).slice(0, 180);
}

function lastSent(text: string) {
  const parts = text.trim().split(/(?<=[.!?…])\s+/).filter(Boolean);
  return (parts[parts.length - 1] || "").slice(0, 180);
}

function hits(text: string, patterns: RegExp[]) {
  return patterns.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);
}

function detectRawFormat(text: string, words: number) {
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  const cyr = (text.match(/[А-Яа-яЁё]/g) || []).length;
  if (latin > cyr * 2 && words < 120) return "performance";
  if (/^(здравствуйте|привет)[!.,]?\s+\1/i.test(text.trim()) || /как вас зовут|очень приятно/i.test(text)) {
    return "street";
  }
  if (/песн|куплет|припев|singing|bye-bye/i.test(text)) return "performance";
  if (/попробуй|сделай это|нужно|необходимо|совет|как научиться|подпишись/i.test(text) && words >= 80) {
    return "advice";
  }
  if (/сегодня я|вчера я|мы с |у меня было|прихожу|я снял|я сделал/i.test(text.slice(0, 400))) {
    return "story";
  }
  return "story";
}

function scoreOne(text: string): {
  format: string;
  wordCount: number;
  overall: number;
  categories: Array<{ id: string; label: string; score: number }>;
  evaluations: Array<{ id: string; name: string; score: number; applicable: boolean }>;
} {
  const words = toks(text);
  const n = words.length;
  const lower = text.toLowerCase();
  const first = firstSent(text);
  const last = lastSent(text);
  const firstLower = first.toLowerCase();
  const greeting = /^(всем )?(привет|здравствуйте|добрый)/i.test(text.trim());
  const announce = /сегодня (расскажу|поговорим|хочу рассказать)|меня зовут|всем привет/i.test(firstLower);
  const sceneOpen =
    /^(я |мы |приходи|вчера|сегодня я|у вашей|у меня |сделай |бросай|сколько раз|сейчас )/i.test(text.trim()) ||
    /почувствовал|подошел|нашел|собрал|снял|пишу|играл/i.test(firstLower);
  const questionOpen = first.includes("?");
  const imperative = /^(сделай|бросай|пиши|смотри|представь|запомни|давай)/i.test(text.trim());
  const paradox = /не потому|иначе рискуете|срок годности|секрет|ошибк/i.test(firstLower);
  const concrete = hits(lower, [
    /вчера|сегодня|три года|на вб|корт|теннис|лего|записок|камеру|reels|яндекс/i,
    /\d+/,
    /друг|папа|баб|жена|дама сердца/i,
  ]);
  const lived = hits(lower, [/у меня|когда я|я сделал|я снял|со мной|мне было|я попробовал/i]);
  const position = hits(lower, [/я думаю|я считаю|для меня|мне кажется|я понял|я люблю|по моему/i]);
  const address = hits(lower, [/\bты\b|\bвы\b|\bтебе\b|\bвам\b|ребята|представь/i]);
  const dialogue = hits(lower, [/как ты думаешь|что вы думаете|напиш|знакомо\?|а ты\b|коммент/i]);
  const payoff = hits(lower, [/поэтому|вот что|тогда я понял|главное|в итоге|с тех пор|и тут/i]);
  const softEnd = /чао|поехали|let's go|клевого дня|красивый снег|это прекрасно|поехали дальше/i.test(last);
  const subscribe = /подпис/i.test(lower);
  const nextStep = /попробуй|сделай|начни|напиши|сохрани/i.test(lower) && !subscribe;
  const filler = words.filter((w) => ["ну", "вот", "типа", "короче", "как бы", "в общем"].includes(w)).length;
  const fillerPer100 = n ? (filler / n) * 100 : 0;
  const unique = hits(lower, [/я называю|мой способ|я делаю иначе|для меня/i]) + (sceneOpen ? 1 : 0);
  const imagery = hits(lower, [/как будто|словно|представь|ощущение|похоже|колюч/i]);
  const audienceIf = hits(lower, [/если ты|если вы|для тех|кто сталкивался|бывает ли|тебе знакомо/i]);
  const problem = hits(lower, [/страх|ошибк|не получается|устал|проблема|боимся|хочешь/i]);
  const waterRepeat = /главное.+\bглавное\b|поэтому.+\bпоэтому\b/is.test(lower);

  const formatHint = detectRawFormat(text, n);

  const raw: Record<string, { score: number; applicable: boolean }> = {
    hook_strength: {
      applicable: true,
      score: clip(
        greeting || announce ? 4 : sceneOpen ? 9 : imperative || paradox ? 8 : questionOpen ? 8 : 6,
      ),
    },
    topic_clarity: {
      applicable: true,
      score: clip(sceneOpen || questionOpen || paradox ? 8 : announce ? 6 : n < 20 ? 5 : 7),
    },
    reason_to_continue: {
      applicable: true,
      score: clip(5 + (questionOpen ? 2 : 0) + (paradox || imperative ? 2 : 0) + (sceneOpen ? 2 : 0)),
    },
    intro_efficiency: {
      applicable: true,
      score: clip(announce || greeting ? 5 : sceneOpen || imperative ? 9 : 7),
    },
    main_idea: {
      applicable: true,
      score: clip(payoff || position ? 8 : n < 30 ? 6 : 7),
    },
    story_payoff: {
      applicable: true,
      score: clip(lived && payoff ? 9 : lived ? 8 : payoff ? 7 : n < 80 ? 7 : 6),
    },
    clarity: {
      applicable: true,
      score: clip(payoff || position ? 8 : n > 300 && !payoff ? 6 : 7),
    },
    argumentation: {
      applicable: true,
      score: clip(lived ? 8 : /потому что|например/i.test(lower) ? 7 : 6),
    },
    specificity: {
      applicable: true,
      score: clip(6 + concrete + (/\d/.test(text) ? 1 : 0)),
    },
    value: {
      applicable: true,
      score: clip(payoff || nextStep || problem ? 8 : lived ? 8 : 6),
    },
    conversational: {
      applicable: true,
      score: clip(9 - (announce ? 2 : 0) - (fillerPer100 > 8 ? 1 : 0)),
    },
    personal_position: {
      applicable: true,
      score: clip(6 + position + (lived ? 2 : 0)),
    },
    personal_experience: {
      applicable: true,
      score: clip(6 + lived + (sceneOpen ? 2 : 0)),
    },
    imagery: {
      applicable: true,
      score: clip(6 + imagery + (concrete ? 1 : 0)),
    },
    unique_voice: {
      applicable: true,
      score: clip(7 + unique + (sceneOpen && lived ? 1 : 0)),
    },
    audience_understanding: {
      applicable: true,
      score: clip(6 + audienceIf + (address ? 1 : 0)),
    },
    problem_relevance: {
      applicable: true,
      score: clip(6 + problem),
    },
    direct_address: {
      applicable: true,
      score: clip(address ? 9 : n < 40 ? 6 : 6),
    },
    dialogue: {
      applicable: true,
      score: clip(dialogue ? 9 : address && /\?/.test(text) ? 7 : 6),
    },
    conclusion: {
      applicable: true,
      score: clip(softEnd || payoff ? 9 : last.length < 12 ? 5 : 7),
    },
    next_action: {
      applicable: true,
      score: clip(nextStep ? 8 : subscribe ? 6 : 6),
    },
    focus: {
      applicable: true,
      score: clip(waterRepeat ? 6 : n > 350 && !payoff ? 7 : fillerPer100 > 6 ? 7 : 9),
    },
  };

  const evaluations: CriterionEvaluation[] = DEFAULT_CRITERIA.map((c) => {
    const row = raw[c.id] ?? { score: 5, applicable: true };
    return {
      id: c.id,
      category: c.categoryId,
      name: c.label,
      applicable: row.applicable,
      score: row.score,
      confidence: 0.55,
      evidence: [],
      analysis: "",
      recommendation: "",
    };
  });

  const formatted = applyFormatApplicability(evaluations, formatHint, n);
  const categories = scoreCategories(formatted.evaluations, DEFAULT_CRITERIA);
  const overall = overallFromCategories(categories);

  return {
    format: formatted.format,
    wordCount: n,
    overall,
    categories: categories.map((c) => ({ id: c.id, label: c.label, score: c.score })),
    evaluations: formatted.evaluations.map((e) => ({
      id: e.id,
      name: e.name,
      score: e.score,
      applicable: e.applicable,
    })),
  };
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[i];
}

function mean(nums: number[]) {
  if (nums.length === 0) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".txt"));
const rows = files.map((file) => {
  const raw = fs.readFileSync(path.join(dir, file), "utf8");
  const text = stripWhisperCredits(raw).trim();
  const words = toks(text).length;
  const credit = /семкин|dimatorzok|редактор субтитров/i.test(raw) && words < 50;
  const empty = words < 8;
  return { file, text, words, credit, empty };
});

const usable = rows.filter((r) => !r.credit && !r.empty);
const scored = usable.map((r) => {
  const s = scoreOne(r.text);
  const id = r.file.match(/sirdenisov__([^\s(]+)/)?.[1] ?? r.file;
  return {
    id,
    file: r.file,
    first: firstSent(r.text),
    last: lastSent(r.text),
    ...s,
  };
});

const overalls = scored.map((s) => s.overall).sort((a, b) => a - b);
const byFormat: Record<string, number> = {};
const formatOverall: Record<string, number[]> = {};
for (const s of scored) {
  byFormat[s.format] = (byFormat[s.format] ?? 0) + 1;
  (formatOverall[s.format] ??= []).push(s.overall);
}

const buckets = [
  { label: "0–3.9", min: 0, max: 3.9 },
  { label: "4.0–5.4", min: 4, max: 5.4 },
  { label: "5.5–6.4", min: 5.5, max: 6.4 },
  { label: "6.5–7.4", min: 6.5, max: 7.4 },
  { label: "7.5–8.4", min: 7.5, max: 8.4 },
  { label: "8.5–10", min: 8.5, max: 10 },
].map((b) => ({
  ...b,
  n: scored.filter((s) => s.overall >= b.min && s.overall <= b.max).length,
}));

const catIds = [...new Set(DEFAULT_CRITERIA.map((c) => c.categoryId))];
const categoryAvg = catIds.map((id) => {
  const label = DEFAULT_CRITERIA.find((c) => c.categoryId === id)?.categoryLabel ?? id;
  const vals = scored
    .map((s) => s.categories.find((c) => c.id === id)?.score)
    .filter((n): n is number => typeof n === "number");
  return { id, label, avg: mean(vals) };
});

const criterionAvg = DEFAULT_CRITERIA.map((c) => {
  const vals = scored
    .map((s) => s.evaluations.find((e) => e.id === c.id))
    .filter((e) => e?.applicable)
    .map((e) => e!.score);
  const nApp = vals.length;
  return {
    id: c.id,
    name: c.label,
    category: c.categoryLabel,
    avg: mean(vals),
    applicablePct: Math.round((nApp / scored.length) * 100),
  };
});

const ranked = [...scored].sort((a, b) => b.overall - a.overall);
const out = {
  method:
    "Локальная оценка по рубрике v1.2 (якорь: сильный разговорный блог = 7–8). Те же веса, что в Vocal.",
  corpus: "Analyz/SirDenisov",
  totalFiles: files.length,
  skippedCredit: rows.filter((r) => r.credit).length,
  skippedEmpty: rows.filter((r) => r.empty).length,
  usable: scored.length,
  overall: {
    min: overalls[0],
    p25: percentile(overalls, 0.25),
    median: percentile(overalls, 0.5),
    p75: percentile(overalls, 0.75),
    max: overalls[overalls.length - 1],
    avg: mean(overalls),
  },
  buckets,
  byFormat,
  formatAvg: Object.fromEntries(
    Object.entries(formatOverall).map(([k, vals]) => [k, mean(vals.sort((a, b) => a - b))]),
  ),
  categoryAvg,
  criterionAvg,
  top: ranked.slice(0, 8).map((s) => ({
    id: s.id,
    overall: s.overall,
    format: s.format,
    words: s.wordCount,
    first: s.first,
    cats: Object.fromEntries(s.categories.map((c) => [c.id, c.score])),
  })),
  bottom: ranked.slice(-8).reverse().map((s) => ({
    id: s.id,
    overall: s.overall,
    format: s.format,
    words: s.wordCount,
    first: s.first,
    cats: Object.fromEntries(s.categories.map((c) => [c.id, c.score])),
  })),
};

fs.writeFileSync("D:/Vocal/Analyz/sirdenisov-scores.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify({ overall: out.overall, byFormat, buckets, categoryAvg, top: out.top, bottom: out.bottom }, null, 2));
