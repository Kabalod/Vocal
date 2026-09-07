export type DiffOp = "eq" | "del" | "add";

export interface DiffChunk {
  op: DiffOp;
  text: string;
}

export interface TextDiffDto {
  chunks: DiffChunk[];
  addedTokens: number;
  removedTokens: number;
  truncated: boolean;
  note: string;
}

export const DIFF_QUALITY_NOTE =
  "Число вставок и удалений — только объём правок, не оценка качества и не выбор лучшего дубля.";

export const DIFF_TRUNCATED_NOTE =
  "Сравнение усечено: показан только начальный фрагмент каждого текста. Полная таблица правок для длинных расшифровок не строится.";

export const MAX_DIFF_CHARS = 8000;
export const MAX_DIFF_TOKENS = 2500;
const MATCH_WINDOW = 48;

export function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((part) => part.length > 0);
}

function merge(chunks: DiffChunk[]): DiffChunk[] {
  const out: DiffChunk[] = [];
  for (const chunk of chunks) {
    const last = out[out.length - 1];
    if (last && last.op === chunk.op) last.text += chunk.text;
    else out.push({ ...chunk });
  }
  return out;
}

function countWords(text: string): number {
  return tokenize(text).filter((part) => part.trim()).length;
}

function clipTokens(tokens: string[], maxTokens: number): { tokens: string[]; clipped: boolean } {
  if (tokens.length <= maxTokens) return { tokens, clipped: false };
  return { tokens: tokens.slice(0, maxTokens), clipped: true };
}

function findWindowMatch(left: string[], i: number, right: string[], j: number): { di: number; dj: number } | null {
  for (let distance = 0; distance <= MATCH_WINDOW; distance++) {
    for (let di = 0; di <= distance; di++) {
      const dj = distance - di;
      if (i + di < left.length && j + dj < right.length && left[i + di] === right[j + dj]) {
        return { di, dj };
      }
    }
  }
  return null;
}

function diffTokens(left: string[], right: string[]): DiffChunk[] {
  const chunks: DiffChunk[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      chunks.push({ op: "eq", text: left[i] });
      i += 1;
      j += 1;
      continue;
    }
    const match = findWindowMatch(left, i, right, j);
    if (!match) {
      chunks.push({ op: "del", text: left[i] });
      chunks.push({ op: "add", text: right[j] });
      i += 1;
      j += 1;
      continue;
    }
    for (let step = 0; step < match.di; step++) {
      chunks.push({ op: "del", text: left[i + step] });
    }
    for (let step = 0; step < match.dj; step++) {
      chunks.push({ op: "add", text: right[j + step] });
    }
    i += match.di;
    j += match.dj;
  }
  while (i < left.length) {
    chunks.push({ op: "del", text: left[i] });
    i += 1;
  }
  while (j < right.length) {
    chunks.push({ op: "add", text: right[j] });
    j += 1;
  }
  return merge(chunks);
}

export function diffTexts(left: string, right: string): TextDiffDto {
  const leftCut = left.length > MAX_DIFF_CHARS ? left.slice(0, MAX_DIFF_CHARS) : left;
  const rightCut = right.length > MAX_DIFF_CHARS ? right.slice(0, MAX_DIFF_CHARS) : right;
  const leftClip = clipTokens(tokenize(leftCut), MAX_DIFF_TOKENS);
  const rightClip = clipTokens(tokenize(rightCut), MAX_DIFF_TOKENS);
  const truncated =
    left.length > MAX_DIFF_CHARS ||
    right.length > MAX_DIFF_CHARS ||
    leftClip.clipped ||
    rightClip.clipped;
  const merged = diffTokens(leftClip.tokens, rightClip.tokens);
  return {
    chunks: merged,
    addedTokens: merged.filter((chunk) => chunk.op === "add").reduce((sum, chunk) => sum + countWords(chunk.text), 0),
    removedTokens: merged.filter((chunk) => chunk.op === "del").reduce((sum, chunk) => sum + countWords(chunk.text), 0),
    truncated,
    note: truncated ? `${DIFF_TRUNCATED_NOTE} ${DIFF_QUALITY_NOTE}` : DIFF_QUALITY_NOTE,
  };
}
