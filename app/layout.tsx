import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GEO Studio",
  description: "Visibilidad de marca en motores de IA"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
