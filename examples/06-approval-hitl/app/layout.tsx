import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Approval / Human-in-the-loop — AI Intuitive Review",
  description:
    "Example 06: an agent that pauses before every external action and renders an approval card — approve, edit, or reject; nothing fires without a click.",
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
