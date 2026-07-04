import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Grounded Citations — AI Intuitive Review",
  description:
    "Example 01: grounded citations via the Anthropic Citations API, with click-to-highlight source attribution.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
