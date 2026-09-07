export type DiffOp = "eq" | "del" | "add";

export interface DiffChunk {
  op: DiffOp;
  text: string;
}

export interface TextDiffDto {
  chunks: DiffChunk[];
  addedTokens: number;
  removedTokens: number;
  note: string;
}

export const DIFF_QUALITY_NOTE =
  "Число вставок и удалений — только объём правок, не оценка качества и не выбор лучшего дубля.";

export function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((part) => part.length > 0);
}

function lcsTable(left: string[], right: string[]): number[][] {
  const rows = left.length;
  const cols = right.length;
  const table: number[][] = Array.from({ length: rows + 1 }, () => Array(cols + 1).fill(0));
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
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

export function diffTexts(left: string, right: string): TextDiffDto {
  const a = tokenize(left);
  const b = tokenize(right);
  const table = lcsTable(a, b);
  const chunks: DiffChunk[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      chunks.push({ op: "eq", text: a[i] });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      chunks.push({ op: "del", text: a[i] });
      i += 1;
    } else {
      chunks.push({ op: "add", text: b[j] });
      j += 1;
    }
  }
  while (i < a.length) {
    chunks.push({ op: "del", text: a[i] });
    i += 1;
  }
  while (j < b.length) {
    chunks.push({ op: "add", text: b[j] });
    j += 1;
  }
  const merged = merge(chunks);
  return {
    chunks: merged,
    addedTokens: merged.filter((chunk) => chunk.op === "add").reduce((sum, chunk) => sum + tokenize(chunk.text).filter((t) => t.trim()).length, 0),
    removedTokens: merged.filter((chunk) => chunk.op === "del").reduce((sum, chunk) => sum + tokenize(chunk.text).filter((t) => t.trim()).length, 0),
    note: DIFF_QUALITY_NOTE,
  };
}
