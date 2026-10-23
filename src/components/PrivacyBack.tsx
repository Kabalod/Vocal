"use client";

import { useRouter } from "next/navigation";

/** /privacy is reachable from the sign-in screen and from the profile: back goes where the reader came from. */
export function PrivacyBack() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="inline-flex min-h-11 items-center text-sm text-muted hover:text-text"
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
    >
      ← Назад
    </button>
  );
}
