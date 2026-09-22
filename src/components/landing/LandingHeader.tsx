"use client";

import Link from "next/link";
import { authHref } from "@/lib/auth/return-to";
import { landingCopy, landingDesktopNav } from "@/lib/landing-content";

export function LandingHeader({ signedIn }: { signedIn: boolean }) {
  const loginHref = signedIn ? "/reels" : authHref("/login");
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
      <Link className="landing-login" href={loginHref}>
        {signedIn ? landingCopy.toThoughts : landingCopy.login}
      </Link>
    </header>
  );
}
