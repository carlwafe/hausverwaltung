"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import { signOut } from "next-auth/react";

type NavLink = { href: string; label: string };
// Abschnitt = Zwischenüberschrift in einem Menü (ohne Titel: nur eine Liste).
type NavAbschnitt = { titel?: string; links: NavLink[] };
type NavGruppe = { label: string; abschnitte: NavAbschnitt[] };

// Direkt in der Leiste (ohne Dropdown). Das Dashboard („/“) steht davor und wird gesondert geprüft.
const DIREKT: NavLink[] = [
  { href: "/tickets", label: "Tickets" },
  { href: "/dokumente", label: "Dokumente" },
];

// Gruppiert nach Aufgabe: Vermietung (alles am Mieter), Geld (laufender Zahlungsverkehr),
// Objekt (Immobilie und Partner), Einstellungen (selten gebraucht, nur Admin).
const VERMIETUNG: NavGruppe = {
  label: "Vermietung",
  abschnitte: [
    {
      titel: "Verträge",
      links: [
        { href: "/mietvertraege", label: "Mietverträge" },
        { href: "/mieter", label: "Mieter" },
        { href: "/kautionen", label: "Kautionen" },
        { href: "/mietvertraege/lastschrift-mandate", label: "Lastschrift-Mandate" },
      ],
    },
    {
      titel: "Jährlich und Anpassungen",
      links: [
        { href: "/mietvertraege/moegliche-erhoehungen", label: "Mieterhöhung" },
        { href: "/mietvertraege/nk-anpassung", label: "BK-Anpassung" },
        { href: "/nebenkostenabrechnungen", label: "Betriebskostenabrechnung" },
        { href: "/nebenkostenausgleich", label: "Betriebskostenausgleich" },
      ],
    },
  ],
};

const GELD: NavGruppe = {
  label: "Geld",
  abschnitte: [
    {
      titel: "Laufend",
      links: [
        { href: "/kontoauszug/import", label: "Kontoauszug importieren" },
        { href: "/miete-monat", label: "Miete diesen Monat" },
        { href: "/offene-posten", label: "Offene Posten" },
      ],
    },
    {
      titel: "Buchungen",
      links: [
        { href: "/zahlungen", label: "Zahlungen" },
        { href: "/kosten", label: "Kosten" },
        { href: "/mietweiterleitungen", label: "Mietweiterleitungen" },
      ],
    },
    {
      titel: "Konto und Darlehen",
      links: [
        { href: "/kontostand", label: "Kontostand" },
        { href: "/kontoprognose", label: "Kontoprognose" },
        { href: "/darlehen", label: "Darlehen" },
        { href: "/darlehen/tilgungsplan", label: "Tilgungspläne" },
      ],
    },
    {
      titel: "Auswertung",
      links: [{ href: "/jahresuebersicht", label: "Jahresübersicht" }],
    },
  ],
};

const OBJEKT: NavGruppe = {
  label: "Objekt",
  abschnitte: [
    {
      links: [
        { href: "/gebaeude", label: "Gebäude" },
        { href: "/einheiten", label: "Einheiten" },
        { href: "/einheiten/zeitachse", label: "Zeitachse" },
        { href: "/leerstand", label: "Leerstand" },
        { href: "/dienstleister", label: "Handwerker & Dienstleister" },
      ],
    },
  ],
};

// Nur für Admins (die Seiten selbst prüfen die Rolle zusätzlich).
const EINSTELLUNGEN: NavGruppe = {
  label: "Einstellungen",
  abschnitte: [
    {
      links: [
        { href: "/objekt", label: "Objekt (Kontakt & Bank)" },
        { href: "/buchungsarten", label: "Buchungsarten" },
        { href: "/kostenarten", label: "Kostenarten" },
        { href: "/mietvertraege/vpi-werte", label: "VPI-Werte" },
        { href: "/benutzer", label: "Benutzer" },
      ],
    },
  ],
};

const NAV_GRUPPEN: NavGruppe[] = [VERMIETUNG, GELD, OBJEKT];

function gruppenLinks(gruppe: NavGruppe): NavLink[] {
  return gruppe.abschnitte.flatMap((a) => a.links);
}

// Seiten, die nicht im Menü stehen, aber einen Tab-Titel bekommen (und beim aktiven Punkt
// auf den passenden Menüpunkt verweisen können).
const WEITERE_SEITEN: NavLink[] = [
  { href: "/kontoauszug/importe", label: "Kontoauszug-Importe" },
  { href: "/quartalsuebersicht", label: "Quartalsübersicht" },
  { href: "/buchungen", label: "Buchungen" },
  { href: "/haeuser", label: "Häuser" },
  { href: "/konto", label: "Konto" },
];

const SEITENTITEL: NavLink[] = [
  ...DIREKT,
  ...[...NAV_GRUPPEN, EINSTELLUNGEN].flatMap(gruppenLinks),
  ...WEITERE_SEITEN,
];

function seitenTitel(pathname: string): string {
  const treffer = SEITENTITEL.filter((l) => pathname === l.href || pathname.startsWith(l.href + "/")).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
  return treffer ? `${treffer.label} · Mietverwaltung Eutin` : "Mietverwaltung Eutin";
}

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

// `rechts`: Menü endet bündig am rechten Rand des Knopfs — für die hinteren Gruppen, damit es auf
// schmalen Desktop-Breiten (ab 768 px) nicht aus dem Fenster ragt.
function NavDropdown({ gruppe, aktiv, rechts }: { gruppe: NavGruppe; aktiv: string | null; rechts: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = gruppenLinks(gruppe).some((l) => l.href === aktiv);

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
        aria-expanded={open}
        className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm ${
          active ? "font-medium text-white" : "text-neutral-400 hover:text-white"
        }`}
      >
        {gruppe.label}
        <span className="text-[10px]">▾</span>
      </button>
      {open && (
        <div className={`absolute ${rechts ? "right-0" : "left-0"} top-full z-10 mt-2 w-60 rounded-md border border-neutral-800 bg-neutral-950 py-1 shadow-lg`}>
          {gruppe.abschnitte.map((abschnitt, i) => (
            <div key={abschnitt.titel ?? i} className={i > 0 ? "mt-1 border-t border-neutral-800 pt-1" : ""}>
              {abschnitt.titel && (
                <div className="px-3 pb-0.5 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                  {abschnitt.titel}
                </div>
              )}
              {abschnitt.links.map((link) => (
                <Link
                  prefetch={false}
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={`block px-3 py-1.5 text-sm ${
                    link.href === aktiv
                      ? "font-medium text-white"
                      : "text-neutral-400 hover:bg-neutral-900 hover:text-white"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Zeile im mobilen Menü: ganze Breite tippbar und mindestens 48 px hoch (Finger statt Maus).
const MOBIL_ZEILE = "flex min-h-12 w-full items-center rounded-md px-3 text-base";

function mobilZeile(aktiv: boolean): string {
  return `${MOBIL_ZEILE} ${aktiv ? "bg-neutral-900 font-medium text-white" : "text-neutral-300 active:bg-neutral-900"}`;
}

// Mobiles Menü (unter md): Dashboard, Tickets und Dokumente direkt, die Gruppen zum Aufklappen —
// sonst wären es über 30 Zeilen untereinander. Beim Öffnen ist die Gruppe der aktuellen Seite offen.
function MobilesMenue({
  gruppen,
  pathname,
  aktiv,
  kontoLabel,
  schliessen,
}: {
  gruppen: NavGruppe[];
  pathname: string;
  aktiv: string | null;
  kontoLabel: string;
  schliessen: () => void;
}) {
  const [offen, setOffen] = useState<ReadonlySet<string>>(
    () => new Set(gruppen.filter((g) => gruppenLinks(g).some((l) => l.href === aktiv)).map((g) => g.label)),
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
        {DIREKT.map((link) => (
          <Link
            prefetch={false}
            key={link.href}
            href={link.href}
            onClick={schliessen}
            className={mobilZeile(aktiv === link.href)}
          >
            {link.label}
          </Link>
        ))}
        {gruppen.map((gruppe) => {
          const istOffen = offen.has(gruppe.label);
          const enthaeltAktiv = gruppenLinks(gruppe).some((l) => l.href === aktiv);
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
                  {gruppe.abschnitte.map((abschnitt, i) => (
                    <div key={abschnitt.titel ?? i} className="flex flex-col gap-0.5">
                      {abschnitt.titel && (
                        <div className="px-3 pb-0.5 pt-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                          {abschnitt.titel}
                        </div>
                      )}
                      {abschnitt.links.map((link) => (
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

  const gruppen = user.role === "ADMIN" ? [...NAV_GRUPPEN, EINSTELLUNGEN] : NAV_GRUPPEN;
  const aktiv = aktiverHref(pathname, [
    ...DIREKT,
    ...gruppen.flatMap(gruppenLinks),
    { href: "/konto", label: "Konto" },
  ]);

  return (
    <header className="border-b border-neutral-800">
      <div className="mx-auto flex w-full max-w-[96rem] items-center justify-between gap-4 px-4 py-3 lg:px-8">
        <div className="flex min-w-0 items-center gap-8">
          <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-semibold text-white">
            <Logo size={26} className="text-white" />
            Mietverwaltung Eutin
          </span>
          {/* Ab md nebeneinander mit Dropdowns — darunter reicht die Breite nicht für Titel + alle
              Menüpunkte + Konto/Abmelden in einer Zeile, siehe mobiles Menü unten. */}
          <nav className="hidden items-center gap-6 md:flex">
            <Link
              prefetch={false}
              href="/"
              className={`shrink-0 whitespace-nowrap text-sm ${
                pathname === "/" ? "font-medium text-white" : "text-neutral-400 hover:text-white"
              }`}
            >
              Dashboard
            </Link>
            {DIREKT.map((link) => (
              <Link
                prefetch={false}
                key={link.href}
                href={link.href}
                className={`shrink-0 whitespace-nowrap text-sm ${
                  aktiv === link.href ? "font-medium text-white" : "text-neutral-400 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            ))}
            {gruppen.map((gruppe, i) => (
              <NavDropdown key={gruppe.label} gruppe={gruppe} aktiv={aktiv} rechts={i >= 2} />
            ))}
          </nav>
        </div>
        <div className="hidden shrink-0 items-center gap-4 md:flex">
          <Link
            prefetch={false}
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
          aktiv={aktiv}
          kontoLabel={user.name ?? user.email ?? "Konto"}
          schliessen={() => setMobileOpen(false)}
        />
      )}
    </header>
  );
}
