import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Research Matchmaker — Find your next question",
  description: "Find a research direction, build your first learning plan, and start a thoughtful conversation with faculty.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
