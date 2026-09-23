"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { authHref } from "@/lib/auth/return-to";
import { landingCopy, landingDesktopNav } from "@/lib/landing-content";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { LandingSession } from "@/components/landing/useLandingSignedIn";

export function LandingHeader({ session }: { session: LandingSession }) {
  const router = useRouter();
  const email = session.email;

  async function signOut() {
    const supabase = createBrowserSupabaseClient();
    await supabase?.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <header className="landing-header landing-wrap">
      <Link className="landing-logo" href="/">
        Vocal
      </Link>
      <nav className="landing-nav" aria-label="Разделы лендинга">
        {landingDesktopNav.map((item) => (
          <a key={item.href} href={item.href}>
            {item.label}
          </a>
        ))}
      </nav>
      {session.signedIn ? (
        <div className="landing-account">
          {email ? (
            <Link className="landing-account-name" href="/reels">
              {email}
            </Link>
          ) : (
            <Link className="landing-account-name" href="/reels">
              {session.name ?? landingCopy.toThoughts}
            </Link>
          )}
          <button type="button" className="landing-logout" onClick={() => void signOut()}>
            {landingCopy.logout}
          </button>
        </div>
      ) : (
        <Link className="landing-login" href={authHref("/login", "/")}>
          {landingCopy.login}
        </Link>
      )}
    </header>
  );
}
