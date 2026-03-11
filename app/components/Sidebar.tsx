"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/clients", label: "Clients", icon: "👤" },
  { href: "/vehicules", label: "Vehicules", icon: "🚗" },
  { href: "/bons-travail", label: "Bons de travail", icon: "🔧" },
  { href: "/agenda", label: "Agenda", icon: "📅" },
  { href: "/factures", label: "Factures", icon: "📄" },
  { href: "/rapports", label: "Rapports", icon: "📈" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 print:hidden">
      <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-5">
        <Link href="/" className="text-xl font-bold text-gray-900 dark:text-gray-100">
          MecaFlow
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-3 space-y-1">
        {mounted && (
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            <span className="text-base">{theme === "dark" ? "☀️" : "🌙"}</span>
            {theme === "dark" ? "Mode clair" : "Mode sombre"}
          </button>
        )}
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors"
        >
          <span className="text-base">🚪</span>
          Deconnexion
        </button>
      </div>
    </aside>
  );
}
