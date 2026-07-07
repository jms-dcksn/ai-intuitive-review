import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Working in the Open — AI Intuitive Review",
  description:
    "Example 03: an agent that surfaces its decisions incrementally, with confidence-gated checkpoints and policy promotion.",
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
