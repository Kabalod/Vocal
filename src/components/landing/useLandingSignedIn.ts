"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type LandingSession = {
  signedIn: boolean;
  email: string | null;
  name: string | null;
};

function fromUser(user: User | null): LandingSession {
  const metadata = user?.user_metadata ?? {};
  const name =
    (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
    (typeof metadata.name === "string" && metadata.name.trim()) ||
    null;
  return {
    signedIn: Boolean(user),
    email: user?.email ?? null,
    name,
  };
}

export function useLandingSignedIn() {
  const [session, setSession] = useState<LandingSession>({
    signedIn: false,
    email: null,
    name: null,
  });

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;

    void supabase.auth.getUser().then(({ data }) => {
      setSession(fromUser(data.user));
    });

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(fromUser(next?.user ?? null));
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  return session;
}
