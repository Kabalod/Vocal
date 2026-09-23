"use client";

import { IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import { authHref } from "@/lib/auth/return-to";
import { landingCopy, landingDesktopNav } from "@/lib/landing-content";
import { Benefits } from "@/components/landing/Benefits";
import { ConversationDemo } from "@/components/landing/ConversationDemo";
import { FeedbackExample, FeedbackMobileCard, LandingFaq, ResultExample } from "@/components/landing/LandingExtras";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { PolaroidVideo } from "@/components/landing/PolaroidVideo";
import { useLandingSignedIn } from "@/components/landing/useLandingSignedIn";
import "@/components/landing/landing.css";

const paperMono = IBM_Plex_Mono({
  subsets: ["latin", "cyrillic"],
  weight: "400",
  display: "swap",
  variable: "--font-ibm-plex-mono",
});

export function LandingPage() {
  const session = useLandingSignedIn();
  const ctaHref = session.signedIn ? "/reels" : authHref("/signup", "/reels");

  return (
    <div className={`landing ${paperMono.variable}`}>
      <LandingHeader session={session} />
      <main>
        <section className="landing-wrap landing-section landing-hero" aria-labelledby="landing-h1">
          <h1 id="landing-h1">
            Мысль уже есть.{" "}
            <span className="landing-h1-line">Давайте найдём</span>{" "}
            <span className="landing-h1-accent">{landingCopy.h1Accent}</span>
          </h1>
          <div className="landing-hero-video">
            <PolaroidVideo />
          </div>
          <p className="landing-hero-copy landing-hero-copy-mobile">{landingCopy.mobileLead}</p>
          <p className="landing-hero-copy landing-hero-copy-desktop">{landingCopy.desktopLead}</p>
          <div className="landing-hero-action">
            <Link className="landing-cta" href={ctaHref} data-placement="hero">
              {landingCopy.cta}
            </Link>
            <p className="landing-hint">{landingCopy.ctaHint}</p>
          </div>
        </section>

        <section id="benefits" className="landing-wrap landing-section" aria-labelledby="landing-benefits">
          <h2 id="landing-benefits" className="sr-only">
            Преимущества
          </h2>
          <Benefits />
        </section>

        <section id="dialog" className="landing-wrap landing-section" aria-labelledby="landing-dialog-title">
          <div className="landing-dialog-grid landing-section-grid">
            <div className="landing-dialog-copy">
              <p className="landing-kicker landing-desktop-only">Как работает</p>
              <h2 id="landing-dialog-title" className="landing-h2">
                <span className="landing-mobile-only">{landingCopy.conversationMobileTitle}</span>
                <span className="landing-desktop-only">{landingCopy.conversationDesktopTitle}</span>
              </h2>
              <p className="landing-lead landing-mobile-only">{landingCopy.conversationMobileLead}</p>
              <p className="landing-lead landing-desktop-only">{landingCopy.conversationDesktopLead}</p>
              <ul className="landing-stages">
                {landingCopy.stages.map((stage, index) => (
                  <li key={stage} className={index === 0 ? "is-current" : undefined}>
                    {stage}
                  </li>
                ))}
              </ul>
            </div>
            <ConversationDemo />
          </div>
        </section>

        <section id="result" className="landing-wrap landing-section">
          <div className="landing-split landing-section-grid">
            <ResultExample />
            <div className="landing-split-copy landing-desktop-only">
              <p className="landing-kicker">{landingCopy.resultKicker}</p>
              <h2 id="landing-result" className="landing-h2">
                {landingCopy.resultTitle}
              </h2>
              <p className="landing-lead">{landingCopy.resultLead}</p>
            </div>
          </div>
        </section>

        <section id="feedback" className="landing-wrap landing-section">
          <div className="landing-split landing-section-grid landing-desktop-only">
            <div className="landing-split-copy">
              <p className="landing-kicker">{landingCopy.feedbackKicker}</p>
              <h2 id="landing-feedback" className="landing-h2">
                <span className="landing-h2-line">{landingCopy.feedbackTitleLines[0]}</span>{" "}
                <span className="landing-h2-line">{landingCopy.feedbackTitleLines[1]}</span>
              </h2>
              <p className="landing-lead">{landingCopy.feedbackLead}</p>
            </div>
            <FeedbackExample />
          </div>
          <FeedbackMobileCard />
        </section>

        <section id="faq" className="landing-wrap landing-section landing-desktop-only" aria-labelledby="landing-faq">
          <div className="landing-split landing-faq-split landing-section-grid">
            <div className="landing-split-copy">
              <p className="landing-kicker">{landingCopy.faqKicker}</p>
              <h2 id="landing-faq" className="landing-h2">
                {landingCopy.faqTitle}
              </h2>
              <p className="landing-lead">{landingCopy.faqLead}</p>
            </div>
            <LandingFaq />
          </div>
        </section>

        <section id="start" className="landing-wrap landing-section">
          <div className="landing-final">
            <h2 className="landing-h2">{landingCopy.finalTitle}</h2>
            <div className="landing-final-action">
              <Link className="landing-cta" href={ctaHref} data-placement="final">
                {landingCopy.cta}
              </Link>
              <p className="landing-hint">{landingCopy.ctaHint}</p>
            </div>
          </div>
        </section>
      </main>
      <footer className="landing-wrap landing-footer">
        <Link className="landing-logo" href="/">
          Vocal
        </Link>
        <nav className="landing-nav" aria-label="Подвал">
          {landingDesktopNav.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        {session.signedIn ? (
          <Link className="landing-login landing-desktop-only" href="/reels">
            {landingCopy.toThoughts}
          </Link>
        ) : (
          <Link className="landing-login landing-desktop-only" href={authHref("/login", "/")}>
            {landingCopy.login}
          </Link>
        )}
      </footer>
    </div>
  );
}
