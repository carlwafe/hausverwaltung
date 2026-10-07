// Buchhaltungs-Stichtag: ab wann Soll/Ist, Sonderforderungen und Saldovortrag eines Mietvertrags gerechnet
// werden. Global steht er am Objekt (`Objekt.buchhaltungAb`); ein Mietvertrag kann einen früheren eigenen
// haben (`Mietvertrag.buchhaltungAb`), wenn ab diesem Datum alle seine Zahlungen vollständig erfasst sind.
// Reine Funktionen ohne Prisma, damit auch Client-Komponenten und Skripte sie nutzen können.

type VertragMitStichtag = { buchhaltungAb?: Date | null };
type ObjektMitStichtag = { buchhaltungAb: Date | null } | null | undefined;

/** Wirksamer Stichtag eines Vertrags: sein eigener, sonst der des Objekts (null = keiner, also Mietbeginn). */
export function effektiverStichtag(vertrag: VertragMitStichtag, objekt: ObjektMitStichtag): Date | null {
  return vertrag.buchhaltungAb ?? objekt?.buchhaltungAb ?? null;
}

/** true, wenn der Vertrag einen eigenen Stichtag hat, der vom Stichtag des Objekts abweicht. */
export function hatEigenenStichtag(vertrag: VertragMitStichtag, objekt: ObjektMitStichtag): boolean {
  if (!vertrag.buchhaltungAb) return false;
  const global = objekt?.buchhaltungAb ?? null;
  return !global || vertrag.buchhaltungAb.getTime() !== global.getTime();
}
