import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reasoning as Proof — AI Intuitive Review",
  description:
    "Example 04: extended thinking streamed as an inspectable reasoning channel — proof-of-work above the answer, collapsed once the answer lands.",
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
