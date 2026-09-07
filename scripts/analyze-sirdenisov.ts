import fs from "fs";
import path from "path";

const dir = "D:/Vocal/Analyz/SirDenisov";
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".txt"));
const fillers = [
  "ну",
  "вот",
  "типа",
  "короче",
  "значит",
];
const creditRe =
  /семкин|dimatorzok|редактор субтитров|корректор а\.|субтитры сделал|субтитры создавал/i;

function toks(t: string) {
  return t
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^a-zа-я0-9-]+/i)
    .filter(Boolean);
}
function firstSent(t: string) {
  return (t.trim().split(/(?<=[.!?…])\s+/)[0] || t.trim()).slice(0, 220);
}
function lastSent(t: string) {
  const parts = t.trim().split(/(?<=[.!?…])\s+/);
  return (parts[parts.length - 1] || "").slice(0, 220);
}

const rows = files.map((f) => {
  const text = fs.readFileSync(path.join(dir, f), "utf8").trim();
  const t = toks(text);
  const n = t.length;
  const joined = t.join(" ");
  return {
    file: f,
    words: n,
    credit: creditRe.test(text) && n < 50,
    empty: n < 8,
    q: (text.match(/\?/g) || []).length,
    ty: t.filter((w) => ["ты", "тебе", "тебя", "твой", "твоя"].includes(w)).length,
    vy: t.filter((w) => ["вы", "вам", "вас", "ваш", "ваша"].includes(w)).length,
    ya: t.filter((w) => w === "я").length,
    cta: /напиш|коммент|подпис|сохран|лайк|попробуй|сделай/i.test(text),
    story: /вчера|сегодня|когда я|у меня было|мы с |друг/i.test(text.slice(0, 500)),
    greeting: /^(всем )?(привет|здравствуйте|добрый)/i.test(text.trim()),
    imperativeOpen: /^(сделай|давай|бросай|пиши|смотри|представь|запомни)/i.test(text.trim()),
    commentInvite: /коммент|срач|что вы думаете|напиши/i.test(text),
    subscribe: /подпис/i.test(text),
    moral: /я считаю|поэтому|вот что|главное|я понял/i.test(text),
    filler: t.filter((w) => fillers.includes(w)).length,
    first: firstSent(text),
    last: lastSent(text),
    preview: text.slice(0, 160).replace(/\s+/g, " "),
  };
});

const real = rows.filter((r) => !r.credit && !r.empty);
const words = real.map((r) => r.words).sort((a, b) => a - b);
const pct = (p: number) => words[Math.min(words.length - 1, Math.floor((words.length - 1) * p))];

const out = {
  total: rows.length,
  credits: rows.filter((r) => r.credit).length,
  empty: rows.filter((r) => r.empty).length,
  usable: real.length,
  words: {
    min: words[0],
    p25: pct(0.25),
    med: pct(0.5),
    p75: pct(0.75),
    max: words[words.length - 1],
    avg: Math.round(real.reduce((s, r) => s + r.words, 0) / real.length),
  },
  hasQ: real.filter((r) => r.q > 0).length,
  hasTy: real.filter((r) => r.ty > 0).length,
  hasVy: real.filter((r) => r.vy > 0).length,
  cta: real.filter((r) => r.cta).length,
  storyOpen: real.filter((r) => r.story).length,
  greeting: real.filter((r) => r.greeting).length,
  commentInvite: real.filter((r) => r.commentInvite).length,
  subscribe: real.filter((r) => r.subscribe).length,
  moral: real.filter((r) => r.moral).length,
  imperativeOpen: real.filter((r) => r.imperativeOpen).length,
  yaShare: Number(
    (real.reduce((s, r) => s + (r.words ? r.ya / r.words : 0), 0) / real.length).toFixed(3),
  ),
  fillerPer100: Number(
    (
      real.reduce((s, r) => s + (r.words ? (r.filler / r.words) * 100 : 0), 0) / real.length
    ).toFixed(2),
  ),
  buckets: {
    lt80: real.filter((r) => r.words < 80).length,
    w80_150: real.filter((r) => r.words >= 80 && r.words < 150).length,
    w150_250: real.filter((r) => r.words >= 150 && r.words < 250).length,
    w250: real.filter((r) => r.words >= 250).length,
  },
  short: real.filter((r) => r.words < 80).slice(0, 10),
  sampleFirst: real.filter((r) => r.words >= 100).slice(0, 12),
  sampleLast: real.filter((r) => r.words >= 80).slice(0, 16),
};

fs.writeFileSync("D:/Vocal/Analyz/sirdenisov-stats.json", JSON.stringify(out, null, 2));
console.log(
  JSON.stringify(
    {
      ...out,
      short: out.short.map((r) => ({ words: r.words, first: r.first })),
      sampleFirst: out.sampleFirst.map((r) => ({ words: r.words, first: r.first })),
      sampleLast: out.sampleLast.map((r) => ({ words: r.words, last: r.last })),
    },
    null,
    2,
  ),
);
