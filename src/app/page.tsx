import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";
import { landingCopy } from "@/lib/landing-content";

export const metadata: Metadata = {
  title: landingCopy.title,
  description: landingCopy.description,
  robots: { index: false, follow: false },
};

export default function HomePage() {
  return <LandingPage />;
}
