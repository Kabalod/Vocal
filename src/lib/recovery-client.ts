export function studioShouldSilentRefetch(input: {
  type: "online" | "visibilitychange";
  visibilityState: string;
}): boolean {
  if (input.type === "online") return true;
  return input.visibilityState === "visible";
}
