import { redirect } from "next/navigation";
import { legacySettingsHref } from "@/lib/legacy-routes";

/** Scoring weights are not used by the thought cycle any more; old links go to the thought list. */
export default function SettingsPage() {
  redirect(legacySettingsHref());
}
