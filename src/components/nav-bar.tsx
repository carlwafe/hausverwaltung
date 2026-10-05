"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import { signOut } from "next-auth/react";

type NavLink = { href: string; label: string };

const STAMMDATEN: NavLink[] = [
  { href: "/mieter", label: "Mieter" },
  { href: "/mietvertraege", label: "Mietverträge" },
  { href: "/mietvertraege/moegliche-erhoehungen", label: "Mieterhöhung möglich ab" },
  { href: "/einheiten", label: "Einheiten" },
  { href: "/einheiten/zeitachse", label: "Zeitachse" },
  { href: "/gebaeude", label: "Gebäude" },
  { href: "/buchungsarten", label: "Buchungsarten" },
  { href: "/dienstleister", label: "Handwerker & Dienstleister" },
];

const FINANZEN: NavLink[] = [
  { href: "/kontoauszug/import", label: "Importieren" },
  { href: "/offene-posten", label: "Offene Posten" },
  { href: "/zahlungen", label: "Zahlungen" },
  { href: "/kosten", label: "Kosten" },
  { href: "/kautionen", label: "Kautionen" },
  { href: "/mietweiterleitungen", label: "Mietweiterleitungen" },
  { href: "/nebenkostenausgleich", label: "Nebenkostenausgleich" },
  { href: "/kontostand", label: "Kontostand" },
];

const ABRECHNUNG: NavLink[] = [
  { href: "/nebenkostenabrechnungen", label: "Nebenkostenabrechnung" },
  { href: "/jahresuebersicht", label: "Jahresübersicht" },
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

const SEITENTITEL: NavLink[] = [
  ...STAMMDATEN,
  ...FINANZEN,
  ...ABRECHNUNG,
  ...VERWALTUNG,
  { href: "/buchungen", label: "Buchungen" },
  { href: "/dokumente", label: "Dokumente" },
  { href: "/haeuser", label: "Häuser" },
  { href: "/kostenarten", label: "Kostenarten" },
  { href: "/tickets", label: "Tickets" },
  { href: "/konto", label: "Konto" },
];

function seitenTitel(pathname: string): string {
  const treffer = SEITENTITEL.filter((l) => pathname === l.href || pathname.startsWith(l.href + "/")).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
  return treffer ? `${treffer.label} · Mietverwaltung Eutin` : "Mietverwaltung Eutin";
}

const NAV_GRUPPEN: { label: string; links: NavLink[] }[] = [
  { label: "Stammdaten", links: STAMMDATEN },
  { label: "Finanzen", links: FINANZEN },
  { label: "Abrechnung", links: ABRECHNUNG },
];

export function NavBar({
  user,
}: {
  user: { name?: string | null; email?: string | null; role: "ADMIN" | "GAST" };
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    document.title = seitenTitel(pathname);
  }, [pathname]);

  const gruppen = user.role === "ADMIN" ? [...NAV_GRUPPEN, { label: "Verwaltung", links: VERWALTUNG }] : NAV_GRUPPEN;

  return (
    <header className="border-b border-neutral-800">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex min-w-0 items-center gap-8">
          <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-semibold text-white">
            <Logo size={26} className="text-yellow-400" />
            Mietverwaltung Eutin
          </span>
          {/* Ab md nebeneinander mit Dropdowns (wie bisher) — darunter reicht die Breite nicht
              für Titel + alle Menüpunkte + Konto/Abmelden in einer Zeile, siehe mobiles Menü
              unten. */}
          <nav className="hidden items-center gap-6 md:flex">
            <Link
              href="/"
              className={`shrink-0 whitespace-nowrap text-sm ${
                pathname === "/" ? "font-medium text-white" : "text-neutral-400 hover:text-white"
              }`}
            >
              Dashboard
            </Link>
            <Link
              href="/tickets"
              className={`shrink-0 whitespace-nowrap text-sm ${
                pathname.startsWith("/tickets") ? "font-medium text-white" : "text-neutral-400 hover:text-white"
              }`}
            >
              Tickets
            </Link>
            <NavDropdown label="Stammdaten" links={STAMMDATEN} pathname={pathname} />
            <NavDropdown label="Finanzen" links={FINANZEN} pathname={pathname} />
            <NavDropdown label="Abrechnung" links={ABRECHNUNG} pathname={pathname} />
            {user.role === "ADMIN" && (
              <NavDropdown label="Verwaltung" links={VERWALTUNG} pathname={pathname} />
            )}
          </nav>
        </div>
        <div className="hidden shrink-0 items-center gap-4 md:flex">
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
        <button
          type="button"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label={mobileOpen ? "Menü schließen" : "Menü öffnen"}
          aria-expanded={mobileOpen}
          className="shrink-0 rounded-md border border-neutral-800 px-2.5 py-1.5 text-sm text-neutral-300 md:hidden"
        >
          {mobileOpen ? "✕" : "☰"}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-neutral-800 px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-4">
            <Link
              href="/"
              onClick={() => setMobileOpen(false)}
              className={`text-sm ${
                pathname === "/" ? "font-medium text-white" : "text-neutral-300"
              }`}
            >
              Dashboard
            </Link>
            <Link
              href="/tickets"
              onClick={() => setMobileOpen(false)}
              className={`text-sm ${
                pathname.startsWith("/tickets") ? "font-medium text-white" : "text-neutral-300"
              }`}
            >
              Tickets
            </Link>
            {gruppen.map((gruppe) => (
              <div key={gruppe.label}>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
                  {gruppe.label}
                </p>
                <div className="flex flex-col gap-2">
                  {gruppe.links.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileOpen(false)}
                      className={`text-sm ${
                        pathname === link.href ? "font-medium text-white" : "text-neutral-300"
                      }`}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="mt-4 flex items-center justify-between border-t border-neutral-800 pt-4">
            <Link
              href="/konto"
              onClick={() => setMobileOpen(false)}
              className={`text-sm ${
                pathname === "/konto" ? "font-medium text-white" : "text-neutral-300"
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
      )}
    </header>
  );
}
