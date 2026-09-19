"use client";

import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="mt-8 text-sm text-muted underline-offset-2 hover:text-text hover:underline"
      onClick={async () => {
        const supabase = createBrowserSupabaseClient();
        await supabase?.auth.signOut();
        router.replace("/login");
        router.refresh();
      }}
    >
      Выйти
    </button>
  );
}
