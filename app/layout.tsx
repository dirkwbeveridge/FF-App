import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "415 Football Club — Draft Intelligence",
  description:
    "Three seasons of 415 Football Club drafts, scored pick by pick, turned into a draft plan for 2026.",
};

const NAV = [
  { href: "/", label: "Playbook" },
  { href: "/slots", label: "Draft Slots" },
  { href: "/value", label: "Positional Value" },
  { href: "/history", label: "Pick History" },
  { href: "/teams", label: "Teams" },
  { href: "/live", label: "Live Draft" },
  { href: "/method", label: "Method" },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-40 border-b border-line bg-ink/85 backdrop-blur">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
            <Link href="/" className="flex items-baseline gap-2 whitespace-nowrap">
              <span className="text-[15px] font-semibold tracking-tight">415 FC</span>
              <span className="text-[11px] uppercase tracking-[0.14em] text-muted">
                Draft Intelligence
              </span>
            </Link>
            <nav className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[13px]">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded px-2.5 py-1.5 text-muted transition-colors hover:bg-panel hover:text-chalk"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-5 py-8">{children}</main>
        <footer className="mx-auto max-w-[1400px] px-5 pb-12 pt-4 text-[12px] leading-relaxed text-muted">
          Built from the league&rsquo;s own Sleeper history: 2023&ndash;2025, 36 team-seasons,
          576 picks. Every fantasy point recomputed from raw stats under this
          league&rsquo;s scoring rules.
        </footer>
      </body>
    </html>
  );
}
