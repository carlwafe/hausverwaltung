"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/gebaeude", label: "Gebäude" },
  { href: "/einheiten", label: "Einheiten" },
  { href: "/mieter", label: "Mieter" },
  { href: "/mietvertraege", label: "Mietverträge" },
  { href: "/zahlungen", label: "Zahlungen" },
  { href: "/offene-posten", label: "Offene Posten" },
  { href: "/kautionen", label: "Kautionen" },
  { href: "/kosten", label: "Kosten" },
  { href: "/mietweiterleitungen", label: "Mietweiterleitungen" },
  { href: "/nebenkostenabrechnungen", label: "Nebenkostenabrechnung" },
  { href: "/verbrauchswerte", label: "Verbrauchswerte" },
];

export function NavBar({
  user,
}: {
  user: { name?: string | null; email?: string | null; role: "ADMIN" | "VERWALTER" };
}) {
  const pathname = usePathname();

  return (
    <header className="border-b border-neutral-800">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <span className="text-sm font-semibold text-white">Mietverwaltung Eutin</span>
          <nav className="flex items-center gap-4">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm ${
                    active ? "font-medium text-white" : "text-neutral-400 hover:text-white"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            {user.role === "ADMIN" && (
              <>
                <Link
                  href="/objekt"
                  className={`text-sm ${
                    pathname === "/objekt"
                      ? "font-medium text-white"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  Objekt
                </Link>
                <Link
                  href="/benutzer"
                  className={`text-sm ${
                    pathname === "/benutzer"
                      ? "font-medium text-white"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  Benutzer
                </Link>
              </>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/konto"
            className={`text-sm ${
              pathname === "/konto" ? "font-medium text-white" : "text-neutral-400 hover:text-white"
            }`}
          >
            {user.name ?? user.email}
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-neutral-400 hover:text-white"
          >
            Abmelden
          </button>
        </div>
      </div>
    </header>
  );
}
