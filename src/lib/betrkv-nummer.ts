// Bezeichnungen der 16 namentlich benannten Betriebskostenarten nach § 2 BetrKV (Nr. 17 „sonstige“
// läuft über Kostenart.istSonstigeBetriebskosten). Ohne Prisma, damit Server- und Client-Komponenten sie nutzen können.
export const BETRKV_NUMMER_LABEL: Record<number, string> = {
  1: "1 — öffentliche Lasten (Grundsteuer)",
  2: "2 — Wasserversorgung",
  3: "3 — Entwässerung",
  4: "4 — Heizung",
  5: "5 — Warmwasser",
  6: "6 — verbundene Heizungs-/Warmwasseranlagen",
  7: "7 — Aufzug",
  8: "8 — Straßenreinigung/Müllbeseitigung",
  9: "9 — Gebäudereinigung/Ungezieferbekämpfung",
  10: "10 — Gartenpflege",
  11: "11 — Beleuchtung",
  12: "12 — Schornsteinreinigung",
  13: "13 — Sach-/Haftpflichtversicherung",
  14: "14 — Hauswart",
  15: "15 — Antenne/Kabelanschluss",
  16: "16 — Wäschepflege-Einrichtungen",
};
