import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SkillForge — Turn real work into a Skill Portfolio",
  description:
    "A focused project workspace for turning meaningful work into an evidence-backed Skill Portfolio.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
