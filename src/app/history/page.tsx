import { redirect } from "next/navigation";
import { legacyHistoryHref } from "@/lib/legacy-routes";

export default function HistoryPage() {
  redirect(legacyHistoryHref());
}
