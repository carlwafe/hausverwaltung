"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

type NavLink = { href: string; label: string };

const STAMMDATEN: NavLink[] = [
  { href: "/gebaeude", label: "Gebäude" },
  { href: "/einheiten", label: "Einheiten" },
  { href: "/mieter", label: "Mieter" },
  { href: "/mietvertraege", label: "Mietverträge" },
];

const FINANZEN: NavLink[] = [
  { href: "/kontoauszug/import", label: "Importieren" },
  { href: "/zahlungen", label: "Zahlungen" },
  { href: "/offene-posten", label: "Offene Posten" },
  { href: "/kautionen", label: "Kautionen" },
  { href: "/kosten", label: "Kosten" },
  { href: "/mietweiterleitungen", label: "Mietweiterleitungen" },
  { href: "/sonstige-buchungen", label: "Sonstige Buchungen" },
];

const ABRECHNUNG: NavLink[] = [
  { href: "/nebenkostenabrechnungen", label: "Nebenkostenabrechnung" },
  { href: "/verbrauchswerte", label: "Verbrauchswerte" },
];

const VERWALTUNG: NavLink[] = [
  { href: "/objekt", label: "Objekt" },
  { href: "/benutzer", label: "Benutzer" },
];

function NavDropdown({ label, links, pathname }: { label: string; links: NavLink[]; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = links.some((l) => l.href === pathname);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm ${
          active ? "font-medium text-white" : "text-neutral-400 hover:text-white"
        }`}
      >
        {label}
        <span className="text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-2 w-48 rounded-md border border-neutral-800 bg-neutral-950 py-1 shadow-lg">
          {links.map((link) => {
            const linkActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`block px-3 py-1.5 text-sm ${
                  linkActive ? "font-medium text-white" : "text-neutral-400 hover:bg-neutral-900 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function NavBar({
  user,
}: {
  user: { name?: string | null; email?: string | null; role: "ADMIN" | "VERWALTER" };
}) {
  const pathname = usePathname();

  return (
    <header className="border-b border-neutral-800">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-4 py-3">
        <div className="flex min-w-0 items-center gap-8">
          <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-white">
            Mietverwaltung Eutin
          </span>
          <nav className="flex items-center gap-6">
            <Link
              href="/"
              className={`shrink-0 whitespace-nowrap text-sm ${
                pathname === "/" ? "font-medium text-white" : "text-neutral-400 hover:text-white"
              }`}
            >
              Dashboard
            </Link>
            <NavDropdown label="Stammdaten" links={STAMMDATEN} pathname={pathname} />
            <NavDropdown label="Finanzen" links={FINANZEN} pathname={pathname} />
            <NavDropdown label="Abrechnung" links={ABRECHNUNG} pathname={pathname} />
            {user.role === "ADMIN" && (
              <NavDropdown label="Verwaltung" links={VERWALTUNG} pathname={pathname} />
            )}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <Link
            href="/konto"
            className={`whitespace-nowrap text-sm ${
              pathname === "/konto" ? "font-medium text-white" : "text-neutral-400 hover:text-white"
            }`}
          >
            {user.name ?? user.email}
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="whitespace-nowrap text-sm text-neutral-400 hover:text-white"
          >
            Abmelden
          </button>
        </div>
      </div>
    </header>
  );
}
