"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import { signOut } from "next-auth/react";

type NavLink = { href: string; label: string };

const STAMMDATEN: NavLink[] = [
  { href: "/mietvertraege", label: "Mietverträge" },
  { href: "/mieter", label: "Mieter" },
  { href: "/mietvertraege/moegliche-erhoehungen", label: "Mieterhöhung" },
  { href: "/mietvertraege/nk-anpassung", label: "NK-Anpassung" },
  { href: "/mietvertraege/lastschrift-mandate", label: "Lastschrift-Mandate" },
  { href: "/einheiten", label: "Einheiten" },
  { href: "/einheiten/zeitachse", label: "Zeitachse" },
  { href: "/leerstand", label: "Leerstand" },
  { href: "/gebaeude", label: "Gebäude" },
  { href: "/darlehen/tilgungsplan", label: "Darlehen & Tilgungspläne" },
  { href: "/buchungsarten", label: "Buchungsarten" },
  { href: "/dienstleister", label: "Handwerker & Dienstleister" },
  { href: "/dokumente", label: "Dokumente" },
];

const FINANZEN: NavLink[] = [
  { href: "/kontoauszug/import", label: "Importieren" },
  { href: "/miete-monat", label: "Miete diesen Monat" },
  { href: "/offene-posten", label: "Offene Posten" },
  { href: "/zahlungen", label: "Zahlungen" },
  { href: "/kosten", label: "Kosten" },
  { href: "/kautionen", label: "Kautionen" },
  { href: "/mietweiterleitungen", label: "Mietweiterleitungen" },
  { href: "/darlehen", label: "Darlehen" },
  { href: "/nebenkostenausgleich", label: "Nebenkostenausgleich" },
  { href: "/kontostand", label: "Kontostand" },
  { href: "/kontoprognose", label: "Kontoprognose" },
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
              <Link prefetch={false}
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
  { href: "/mietvertraege/vpi-werte", label: "VPI-Werte" },
  { href: "/kontoauszug/importe", label: "Kontoauszug-Importe" },
  { href: "/buchungen", label: "Buchungen" },
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

const NAV_GRUPPEN: NavGruppe[] = [
  { label: "Stammdaten", links: STAMMDATEN },
  { label: "Finanzen", links: FINANZEN },
  { label: "Abrechnung", links: ABRECHNUNG },
];

type NavGruppe = { label: string; links: NavLink[] };

// Der Menüpunkt zur aktuellen Seite: längster passender Pfad, damit auch Unterseiten
// (/mietvertraege/123) ihren Punkt markieren und /mietvertraege/nk-anpassung nicht „Mietverträge“.
function aktiverHref(pathname: string, links: NavLink[]): string | null {
  let treffer: string | null = null;
  for (const l of links) {
    if ((pathname === l.href || pathname.startsWith(l.href + "/")) && l.href.length > (treffer?.length ?? 0)) {
      treffer = l.href;
    }
  }
  return treffer;
}

// Zeile im mobilen Menü: ganze Breite tippbar und mindestens 48 px hoch (Finger statt Maus).
const MOBIL_ZEILE = "flex min-h-12 w-full items-center rounded-md px-3 text-base";

function mobilZeile(aktiv: boolean): string {
  return `${MOBIL_ZEILE} ${aktiv ? "bg-neutral-900 font-medium text-white" : "text-neutral-300 active:bg-neutral-900"}`;
}

// Mobiles Menü (unter md): Dashboard und Tickets direkt, die Gruppen zum Aufklappen — sonst
// wären es über 30 Zeilen untereinander. Beim Öffnen ist die Gruppe der aktuellen Seite offen.
function MobilesMenue({
  gruppen,
  pathname,
  kontoLabel,
  schliessen,
}: {
  gruppen: NavGruppe[];
  pathname: string;
  kontoLabel: string;
  schliessen: () => void;
}) {
  const aktiv = aktiverHref(pathname, [
    ...gruppen.flatMap((g) => g.links),
    { href: "/tickets", label: "Tickets" },
    { href: "/konto", label: "Konto" },
  ]);
  const [offen, setOffen] = useState<ReadonlySet<string>>(
    () => new Set(gruppen.filter((g) => g.links.some((l) => l.href === aktiv)).map((g) => g.label)),
  );

  function umschalten(label: string) {
    setOffen((alt) => {
      const neu = new Set(alt);
      if (!neu.delete(label)) neu.add(label);
      return neu;
    });
  }

  return (
    <div className="border-t border-neutral-800 px-1 py-2 md:hidden">
      <nav className="flex flex-col gap-0.5">
        <Link prefetch={false} href="/" onClick={schliessen} className={mobilZeile(pathname === "/")}>
          Dashboard
        </Link>
        <Link prefetch={false} href="/tickets" onClick={schliessen} className={mobilZeile(aktiv === "/tickets")}>
          Tickets
        </Link>
        {gruppen.map((gruppe) => {
          const istOffen = offen.has(gruppe.label);
          const enthaeltAktiv = gruppe.links.some((l) => l.href === aktiv);
          return (
            <div key={gruppe.label}>
              <button
                type="button"
                onClick={() => umschalten(gruppe.label)}
                aria-expanded={istOffen}
                className={`${MOBIL_ZEILE} justify-between active:bg-neutral-900 ${
                  enthaeltAktiv ? "font-medium text-white" : "text-neutral-300"
                }`}
              >
                {gruppe.label}
                <span aria-hidden className={`text-sm text-neutral-500 transition-transform ${istOffen ? "rotate-180" : ""}`}>
                  ▾
                </span>
              </button>
              {istOffen && (
                <div className="mb-1 ml-3 flex flex-col gap-0.5 border-l border-neutral-800 pl-1">
                  {gruppe.links.map((link) => (
                    <Link
                      prefetch={false}
                      key={link.href}
                      href={link.href}
                      onClick={schliessen}
                      className={mobilZeile(link.href === aktiv)}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="mx-3 mt-2 grid grid-cols-2 gap-2 border-t border-neutral-800 pb-1 pt-3">
        <Link
          prefetch={false}
          href="/konto"
          onClick={schliessen}
          className={`flex h-12 min-w-0 items-center justify-center rounded-md border border-neutral-800 px-3 text-sm ${
            aktiv === "/konto" ? "bg-neutral-900 font-medium text-white" : "text-neutral-300 active:bg-neutral-900"
          }`}
        >
          <span className="truncate">{kontoLabel}</span>
        </Link>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex h-12 items-center justify-center rounded-md border border-neutral-800 px-3 text-sm text-neutral-300 active:bg-neutral-900"
        >
          Abmelden
        </button>
      </div>
    </div>
  );
}

export function NavBar({
  user,
}: {
  user: { name?: string | null; email?: string | null; role: "ADMIN" | "GAST" };
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Next setzt den Titel aus den Layout-Metadaten bei jeder Navigation (auch nur mit anderen
  // Suchparametern, z.B. in den Dokumente-Ordnern) neu — deshalb den Titel nachziehen, sobald
  // jemand ihn im <head> ändert.
  useEffect(() => {
    const titel = seitenTitel(pathname);
    const setze = () => {
      if (document.title !== titel) document.title = titel;
    };
    setze();
    const beobachter = new MutationObserver(setze);
    beobachter.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => beobachter.disconnect();
  }, [pathname]);

  const gruppen = user.role === "ADMIN" ? [...NAV_GRUPPEN, { label: "Verwaltung", links: VERWALTUNG }] : NAV_GRUPPEN;

  return (
    <header className="border-b border-neutral-800">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex min-w-0 items-center gap-8">
          <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-semibold text-white">
            <Logo size={26} className="text-white" />
            Mietverwaltung Eutin
          </span>
          {/* Ab md nebeneinander mit Dropdowns (wie bisher) — darunter reicht die Breite nicht
              für Titel + alle Menüpunkte + Konto/Abmelden in einer Zeile, siehe mobiles Menü
              unten. */}
          <nav className="hidden items-center gap-6 md:flex">
            <Link prefetch={false}
              href="/"
              className={`shrink-0 whitespace-nowrap text-sm ${
                pathname === "/" ? "font-medium text-white" : "text-neutral-400 hover:text-white"
              }`}
            >
              Dashboard
            </Link>
            <Link prefetch={false}
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
          <Link prefetch={false}
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
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-neutral-800 text-lg text-neutral-300 active:bg-neutral-900 md:hidden"
        >
          {mobileOpen ? "✕" : "☰"}
        </button>
      </div>

      {mobileOpen && (
        <MobilesMenue
          gruppen={gruppen}
          pathname={pathname}
          kontoLabel={user.name ?? user.email ?? "Konto"}
          schliessen={() => setMobileOpen(false)}
        />
      )}
    </header>
  );
}
