import type { Metadata, Viewport } from "next";
import { Inter, Oswald } from "next/font/google";
import Link from "next/link";
import "./globals.css";

// Self-hosted at build time — the static site makes no external font requests.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const oswald = Oswald({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-oswald",
});

export const metadata: Metadata = {
  title: "Bud Iceman — 415 FC Draft Intelligence",
  description:
    "Three seasons of 415 Football Club drafts, scored pick by pick, turned into a draft plan for 2026.",
  applicationName: "Bud Iceman",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Bud Iceman" },
};

export const viewport: Viewport = {
  themeColor: "#050b14",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const NAV = [
  { href: "/", label: "Playbook", short: "Play" },
  { href: "/board", label: "Draft Board", short: "Board" },
  { href: "/plan", label: "Draft Plan", short: "Plan" },
  { href: "/team", label: "Start / Sit", short: "Start" },
  { href: "/waivers", label: "Waivers", short: "Wire" },
  { href: "/live", label: "Live Draft", short: "Live" },
  { href: "/slots", label: "Draft Slots", short: "Slots" },
  { href: "/value", label: "Positional Value", short: "Value" },
  { href: "/history", label: "Pick History", short: "Picks" },
  { href: "/teams", label: "Teams", short: "Teams" },
  { href: "/method", label: "Method", short: "Method" },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${oswald.variable}`}>
      <body className="min-h-screen font-[family-name:var(--font-inter)] antialiased">
        <header className="sticky top-0 z-40 border-b border-line bg-[color-mix(in_srgb,var(--color-ink)_88%,transparent)] backdrop-blur-md">
          <div className="mx-auto max-w-[1400px] px-4 pt-[env(safe-area-inset-top)] sm:px-5">
            <div className="flex items-center gap-3 py-2.5">
              <Link href="/" className="flex shrink-0 items-baseline gap-2">
                <span
                  className="display text-[17px] font-bold uppercase tracking-[0.06em]"
                  style={{ color: "var(--color-bears)" }}
                >
                  Bud Iceman
                </span>
                <span className="hidden text-[10.5px] uppercase tracking-[0.16em] text-muted sm:inline">
                  415 FC
                </span>
              </Link>
            </div>
            {/* Horizontally scrollable on a phone; wraps to a row on desktop. */}
            <nav className="scroll-x -mx-4 flex gap-1 px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="shrink-0 rounded px-2.5 py-1.5 text-[13px] text-muted transition-colors hover:bg-panel-2 hover:text-chalk"
                >
                  <span className="sm:hidden">{n.short}</span>
                  <span className="hidden sm:inline">{n.label}</span>
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-5 sm:py-8">{children}</main>
        <footer className="mx-auto max-w-[1400px] px-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-4 text-[12px] leading-relaxed text-muted sm:px-5">
          Built from the league&rsquo;s own Sleeper history: 2023&ndash;2025, 36 team-seasons,
          576 picks. Every fantasy point recomputed from raw stats under this
          league&rsquo;s scoring rules.
        </footer>
      </body>
    </html>
  );
}
