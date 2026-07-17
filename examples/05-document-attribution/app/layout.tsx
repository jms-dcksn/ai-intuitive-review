import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Document Attribution — AI Intuitive Review",
  description:
    "Example 05: agent findings over a real SEC 10-K, each linked to the exact highlighted span in the source document — split view, minimap, honest anchoring.",
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
