"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  {
    href: "/dashboard",
    label: "Playlists",
    match: (p: string) => p.startsWith("/dashboard") || p.startsWith("/pairs"),
  },
  { href: "/settings", label: "Einstellungen", match: (p: string) => p.startsWith("/settings") },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen grid grid-cols-[148px_1fr]">
      <aside className="sticky top-0 h-screen border-r border-[var(--border)] bg-black/30 flex flex-col px-3 py-6 gap-1">
        <Link
          href="/dashboard"
          className="mb-5 mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-[linear-gradient(135deg,#1ed760,#00d4ff)] text-black font-bold"
          style={{ fontFamily: "var(--font-syne), sans-serif" }}
          title="Music Sync"
        >
          MS
        </Link>
        {nav.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-2xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-[var(--bg-panel)] text-white border border-[var(--border)]"
                  : "text-[var(--muted)] hover:text-white border border-transparent"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </aside>
      <div className="min-w-0 relative z-0">{children}</div>
    </div>
  );
}
