"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  {
    href: "/dashboard",
    label: "Playlists",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
        />
      </svg>
    ),
    match: (p: string) => p.startsWith("/dashboard") || p.startsWith("/pairs"),
  },
  {
    href: "/settings",
    label: "Einstellungen",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.8}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    ),
    match: (p: string) => p.startsWith("/settings"),
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen md:grid md:grid-cols-[160px_1fr]">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex sticky top-0 h-screen border-r border-[var(--border)] bg-black/30 flex-col px-3 py-6 gap-2">
        <Link
          href="/dashboard"
          className="mb-6 flex items-center gap-3 px-2 text-decoration-none"
        >
          <div
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(135deg,#1ed760,#00d4ff)] text-black font-bold text-sm shadow-[0_0_25px_rgba(30,215,96,0.3)]"
            style={{ fontFamily: "var(--font-syne), sans-serif" }}
          >
            MS
          </div>
          <div className="min-w-0">
            <span
              className="text-sm font-semibold tracking-tight block text-white truncate"
              style={{ fontFamily: "var(--font-syne), sans-serif" }}
            >
              Music Sync
            </span>
            <span className="text-[10px] text-[var(--muted)] uppercase tracking-wider block">
              Voll-Sync
            </span>
          </div>
        </Link>

        <nav className="flex flex-col gap-1.5 flex-1">
          {nav.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-[var(--bg-panel)] text-white border border-[var(--border)] shadow-sm"
                    : "text-[var(--muted)] hover:text-white border border-transparent hover:bg-white/5"
                }`}
              >
                <span className={active ? "text-[var(--spotify)]" : "text-[var(--muted)]"}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="pt-4 border-t border-[var(--border)] px-2">
          <p className="text-[11px] text-[var(--muted)]">Spotify ↔ Tidal</p>
          <p className="text-[10px] text-[var(--muted)]/60">Single-User Sync</p>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between px-5 py-4 border-b border-[var(--border)] bg-black/40 backdrop-blur sticky top-0 z-30">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div
            className="grid h-8 w-8 place-items-center rounded-xl bg-[linear-gradient(135deg,#1ed760,#00d4ff)] text-black font-bold text-xs"
            style={{ fontFamily: "var(--font-syne), sans-serif" }}
          >
            MS
          </div>
          <span
            className="font-semibold text-white tracking-tight"
            style={{ fontFamily: "var(--font-syne), sans-serif" }}
          >
            Music Sync
          </span>
        </Link>
        <span className="text-[11px] rounded-full border border-[var(--border)] bg-black/40 px-2.5 py-1 text-[var(--muted)]">
          Voll-Sync
        </span>
      </header>

      {/* Main Content Area */}
      <main className="min-w-0 relative z-0 pb-24 md:pb-10">{children}</main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-black/85 backdrop-blur-lg border-t border-[var(--border)] z-40 flex items-center justify-around py-2 px-4 shadow-lg">
        {nav.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl text-xs font-medium transition ${
                active ? "text-[var(--spotify)]" : "text-[var(--muted)]"
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
