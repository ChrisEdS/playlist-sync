"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/dashboard", label: "Playlists", icon: "⇄" },
  { href: "/settings", label: "Settings", icon: "●" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen grid grid-cols-[72px_1fr]">
      <aside className="border-r border-[var(--border)] bg-black/30 flex flex-col items-center py-6 gap-3">
        <Link
          href="/dashboard"
          className="mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-[linear-gradient(135deg,#1ed760,#00d4ff)] text-black font-bold"
          style={{ fontFamily: "var(--font-syne), sans-serif" }}
          title="Music Sync"
        >
          MS
        </Link>
        {nav.map((item) => {
          const active = pathname.startsWith(item.href) || (item.href === "/dashboard" && pathname.startsWith("/pairs"));
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`grid h-11 w-11 place-items-center rounded-2xl text-lg transition ${
                active
                  ? "bg-[var(--bg-panel)] text-white border border-[var(--border)]"
                  : "text-[var(--muted)] hover:text-white"
              }`}
            >
              {item.icon}
            </Link>
          );
        })}
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
