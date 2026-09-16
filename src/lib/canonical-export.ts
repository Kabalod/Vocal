import { isHeadKind } from "@/types/script";

export class ExportError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ExportError";
  }
}

export function sanitizeExportFilename(title: string): string {
  const base =
    title
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 48) || "mysl";
  return `${base}.txt`;
}

export function resolveCanonicalExportScriptId(input: {
  requestedId?: string | null;
  finalScriptId: string | null;
  selectedScriptId: string | null;
}): string | null {
  return input.requestedId?.trim() || input.finalScriptId || input.selectedScriptId || null;
}

export function buildCanonicalExportTxt(input: {
  title: string;
  scriptLabel?: string | null;
  scriptBody: string;
  takeLabel?: string | null;
  takeText?: string | null;
}): string {
  const script = input.scriptBody.trim();
  if (!script) {
    throw new ExportError("Нет готового сценария для экспорта.", "EXPORT_EMPTY");
  }
  const blocks = [input.title.trim() || "Мысль"];
  if (input.scriptLabel?.trim()) blocks.push(input.scriptLabel.trim());
  blocks.push("", script);
  const takeText = input.takeText?.trim() ?? "";
  if (takeText) {
    blocks.push("", input.takeLabel?.trim() || "Итоговый дубль", "", takeText);
  }
  return `${blocks.join("\n").trim()}\n`;
}

export function canonicalExportLooksSafe(text: string, foreignIds: string[] = []): boolean {
  if (/GROQ_API_KEY|DATABASE_URL/.test(text)) return false;
  if (/sk-[A-Za-z0-9]{8,}/.test(text)) return false;
  if (/[A-Za-z]:\\|\/Users\/|\/home\//.test(text)) return false;
  return foreignIds.every((id) => !id || !text.includes(id));
}

export function assertCanonicalScriptExportable(kind: string): void {
  if (!isHeadKind(kind)) {
    throw new ExportError("Экспортируйте готовую версию сценария, не черновик.", "EXPORT_NOT_READY");
  }
}

export async function copyCanonicalExport(
  text: string,
  clipboard?: { writeText: (value: string) => Promise<void> } | null,
): Promise<"copied" | "manual"> {
  const body = text.trim();
  if (!body) return "manual";
  const api =
    clipboard === undefined && typeof navigator !== "undefined" ? navigator.clipboard : clipboard;
  try {
    if (!api?.writeText) return "manual";
    await api.writeText(text);
    return "copied";
  } catch {
    return "manual";
  }
}

export function downloadCanonicalExport(filename: string, text: string): "downloaded" | "manual" {
  try {
    if (typeof document === "undefined" || typeof URL === "undefined") return "manual";
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    return "downloaded";
  } catch {
    return "manual";
  }
}
