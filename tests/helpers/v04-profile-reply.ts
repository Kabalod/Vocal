export function v04ReplaceExplicitJson(
  evidenceMessageIds: string[],
  category: string,
  value: string,
) {
  return JSON.stringify({
    kind: "apply_update",
    category,
    value,
    scope: "global",
    evidenceType: "explicit_statement",
    evidenceMessageIds,
    confidence: 0.9,
    operation: "replace_explicit",
  });
}

export function v04NoChangeJson(reasonCode = "insufficient_signal") {
  return JSON.stringify({ kind: "no_change", reasonCode });
}
