export const C00_POLICY_ENV = "VOCAL_C00_POLICY";

/** Test-only override. Production keeps `null` and reads the env flag. */
export const c00PolicySeam = {
  enabled: null as boolean | null,
};

/** Default on. `0` / `off` / `false` / `disabled` rolls C00 policy back to the V03 path. */
export function isC00PolicyEnabled() {
  if (c00PolicySeam.enabled != null) return c00PolicySeam.enabled;
  const raw = process.env[C00_POLICY_ENV]?.trim().toLowerCase();
  return raw !== "0" && raw !== "off" && raw !== "false" && raw !== "disabled";
}
