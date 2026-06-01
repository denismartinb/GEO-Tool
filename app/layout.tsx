import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GEO Studio v0",
  description: "GEO Studio MVP scaffold"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
