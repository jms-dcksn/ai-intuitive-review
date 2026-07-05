import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Progressive Disclosure — AI Intuitive Review",
  description:
    "Example 02: a streamed, tiered finding tree the user reveals one level at a time.",
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
