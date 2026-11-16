// Antwortform der globalen Suche (`/api/suche`); eigene Datei ohne Prisma, damit die Client-Komponente sie importieren darf.
export type SuchTreffer = { href: string; titel: string; zusatz: string; marke: string | null };
export type SuchGruppe = { titel: string; treffer: SuchTreffer[] };
