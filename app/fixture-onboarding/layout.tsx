import type { Metadata } from "next";
import type { ReactNode } from "react";

// FIXTURE-ONLY branch (never merge). Not indexable, not linked from anywhere.
export const metadata: Metadata = { title: "Fixture · asistente de alta", robots: { index: false, follow: false } };

export default function FixtureLayout({ children }: { children: ReactNode }) {
  return children;
}
