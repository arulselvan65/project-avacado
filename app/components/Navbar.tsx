"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();

  const navItems = [
    {
      href: "/register",
      label: "Register Tree",
      shortLabel: "Register",
      icon: (
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      ),
    },
    {
      href: "/trees",
      label: "Tree Records",
      shortLabel: "Records",
      icon: (
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      ),
    },
    {
      href: "/map",
      label: "Live Map",
      shortLabel: "Map",
      icon: (
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
          <line x1="8" y1="2" x2="8" y2="18" />
          <line x1="16" y1="6" x2="16" y2="22" />
        </svg>
      ),
    },
  ];

  return (
    <header
      className="sticky top-0 z-[1100] w-full backdrop-blur-xl border-b transition-colors"
      style={{
        background: "rgba(10, 12, 16, 0.85)",
        borderColor: "var(--border-secondary)",
      }}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2">
        {/* Brand Logo & Title */}
        <Link
          href="/register"
          className="flex items-center gap-2.5 group shrink-0"
        >
          <div
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center font-bold text-lg shadow-md transition-transform group-hover:scale-105"
            style={{
              background:
                "linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(22, 163, 74, 0.4))",
              border: "1px solid rgba(74, 222, 128, 0.3)",
              color: "#4ade80",
            }}
          >
            🥑
          </div>
          <div className="flex flex-col">
            <span
              className="text-sm sm:text-base font-bold tracking-tight leading-tight"
              style={{ color: "var(--text-primary)" }}
            >
              Mages Farms
            </span>
            <span
              className="text-[10px] font-medium tracking-wide uppercase hidden xs:inline"
              style={{ color: "var(--text-tertiary)" }}
            >
              Kodai Farm Tracker
            </span>
          </div>
        </Link>

        {/* Nav Links */}
        <nav className="flex items-center gap-1 sm:gap-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                  isActive
                    ? "shadow-sm"
                    : "hover:bg-white/5 opacity-80 hover:opacity-100"
                }`}
                style={
                  isActive
                    ? {
                        background: "rgba(34, 197, 94, 0.15)",
                        border: "1px solid rgba(74, 222, 128, 0.35)",
                        color: "#4ade80",
                      }
                    : {
                        color: "var(--text-secondary)",
                        border: "1px solid transparent",
                      }
                }
              >
                {item.icon}
                <span className="hidden sm:inline">{item.label}</span>
                <span className="sm:hidden">{item.shortLabel}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
