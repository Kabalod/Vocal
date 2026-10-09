// "Transcript mode" for the simulated author (E7): turns a clean written answer into what a speech-to-text system would hand
// to the service: lower case, no punctuation, filler words, self-repeats, one broken phrase, a couple of recognition errors.
// Deterministic for a given seed. It models Whisper-like output; it does not prove behaviour on real recordings.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FILLERS = ["ну", "как бы", "короче", "типа", "ну как бы", "э-э", "эм", "ну вот", "это самое"];

/** Typical recognition slips: unstressed vowels and soft endings. */
function corrupt(word: string): string {
  const pairs: [RegExp, string][] = [
    [/(?<=\p{L}{2})о(?=\p{L}{2})/u, "а"],
    [/(?<=\p{L}{2})е(?=\p{L}{2})/u, "и"],
    [/ться$/u, "тся"],
    [/ет$/u, "ит"],
    [/ют$/u, "ут"],
  ];
  for (const [re, to] of pairs) if (re.test(word)) return word.replace(re, to);
  return word;
}

export function toTranscript(text: string, seed: number): string {
  const rnd = rng(seed);
  const sentences = text.replace(/\s+/g, " ").split(/(?<=[.!?…])\s+/).filter(Boolean);
  // one broken phrase: a sentence cut off at about half and not finished
  if (sentences.length >= 3 && rnd() < 0.7) {
    const k = 1 + Math.floor(rnd() * (sentences.length - 1));
    const w = sentences[k].split(" ");
    sentences[k] = w.slice(0, Math.max(3, Math.floor(w.length * 0.55))).join(" ");
  }
  const out: string[] = [];
  for (const sentence of sentences) {
    const words = sentence
      .toLowerCase()
      .replace(/[.,!?;:…«»"()[\]—–]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    if (words.length === 0) continue;
    if (rnd() < 0.4) out.push(FILLERS[Math.floor(rnd() * FILLERS.length)]);
    words.forEach((word, i) => {
      out.push(word);
      if (i < words.length - 1 && rnd() < 0.06) out.push(FILLERS[Math.floor(rnd() * FILLERS.length)]);
      if (rnd() < 0.05) out.push(word); // a self-repeat
    });
    if (words.length >= 4 && rnd() < 0.18) out.push(...words.slice(-2)); // a repeated pair at the end of a phrase
  }
  // two recognition errors on longer words
  const candidates = out.map((w, i) => ({ w, i })).filter((x) => x.w.length >= 6 && /^\p{L}+$/u.test(x.w));
  for (let n = 0; n < 2 && candidates.length; n += 1) {
    const pick = candidates.splice(Math.floor(rnd() * candidates.length), 1)[0];
    out[pick.i] = corrupt(pick.w);
  }
  return out.join(" ");
}
