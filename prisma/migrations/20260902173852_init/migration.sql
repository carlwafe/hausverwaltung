-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'VERWALTER');

-- CreateEnum
CREATE TYPE "EinheitTyp" AS ENUM ('WOHNUNG', 'GEWERBE', 'STELLPLATZ');

-- CreateEnum
CREATE TYPE "MietvertragStatus" AS ENUM ('AKTIV', 'BEENDET', 'GEPLANT');

-- CreateEnum
CREATE TYPE "Verteilerschluessel" AS ENUM ('WOHNFLAECHE', 'MITEIGENTUMSANTEIL', 'PERSONENZAHL', 'EINHEITEN', 'VERBRAUCH_MANUELL');

-- CreateEnum
CREATE TYPE "KautionAnlageform" AS ENUM ('SPARBUCH', 'KAUTIONSKONTO', 'BUERGSCHAFT', 'BAR');

-- CreateEnum
CREATE TYPE "KautionStatus" AS ENUM ('AKTIV', 'ZURUECKGEZAHLT');

-- CreateEnum
CREATE TYPE "AbrechnungStatus" AS ENUM ('ENTWURF', 'FINAL');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VERWALTER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objekte" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "strasse" TEXT NOT NULL,
    "hausnummer" TEXT NOT NULL,
    "plz" TEXT NOT NULL,
    "ort" TEXT NOT NULL DEFAULT 'Eutin',
    "beschreibung" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "objekte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "einheiten" (
    "id" TEXT NOT NULL,
    "objektId" TEXT NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "typ" "EinheitTyp" NOT NULL DEFAULT 'WOHNUNG',
    "etage" TEXT,
    "wohnflaecheQm" DECIMAL(8,2) NOT NULL,
    "miteigentumsanteil" DECIMAL(10,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "einheiten_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mieter" (
    "id" TEXT NOT NULL,
    "vorname" TEXT NOT NULL,
    "nachname" TEXT NOT NULL,
    "email" TEXT,
    "telefon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mieter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mietvertraege" (
    "id" TEXT NOT NULL,
    "einheitId" TEXT NOT NULL,
    "mieterId" TEXT NOT NULL,
    "beginn" TIMESTAMP(3) NOT NULL,
    "ende" TIMESTAMP(3),
    "kaltmiete" DECIMAL(10,2) NOT NULL,
    "nebenkostenVorauszahlung" DECIMAL(10,2) NOT NULL,
    "status" "MietvertragStatus" NOT NULL DEFAULT 'AKTIV',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mietvertraege_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kautionen" (
    "id" TEXT NOT NULL,
    "mietvertragId" TEXT NOT NULL,
    "betrag" DECIMAL(10,2) NOT NULL,
    "anlageform" "KautionAnlageform" NOT NULL DEFAULT 'KAUTIONSKONTO',
    "zinssatz" DECIMAL(5,2),
    "einzahlungsdatum" TIMESTAMP(3),
    "rueckzahlungsdatum" TIMESTAMP(3),
    "rueckzahlungsbetrag" DECIMAL(10,2),
    "status" "KautionStatus" NOT NULL DEFAULT 'AKTIV',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kautionen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zahlungen" (
    "id" TEXT NOT NULL,
    "mietvertragId" TEXT NOT NULL,
    "datum" TIMESTAMP(3) NOT NULL,
    "betrag" DECIMAL(10,2) NOT NULL,
    "periodeMonat" INTEGER NOT NULL,
    "periodeJahr" INTEGER NOT NULL,
    "verwendungszweck" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zahlungen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kostenarten" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "umlagefaehig" BOOLEAN NOT NULL DEFAULT true,
    "standardVerteilerschluessel" "Verteilerschluessel",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kostenarten_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kostenpositionen" (
    "id" TEXT NOT NULL,
    "kostenartId" TEXT NOT NULL,
    "objektId" TEXT NOT NULL,
    "jahr" INTEGER NOT NULL,
    "betrag" DECIMAL(10,2) NOT NULL,
    "beschreibung" TEXT,
    "empfaenger" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kostenpositionen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nebenkostenabrechnungen" (
    "id" TEXT NOT NULL,
    "objektId" TEXT NOT NULL,
    "jahr" INTEGER NOT NULL,
    "status" "AbrechnungStatus" NOT NULL DEFAULT 'ENTWURF',
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nebenkostenabrechnungen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nebenkostenabrechnung_positionen" (
    "id" TEXT NOT NULL,
    "abrechnungId" TEXT NOT NULL,
    "einheitId" TEXT NOT NULL,
    "mietvertragId" TEXT,
    "kostenanteilGesamt" DECIMAL(10,2) NOT NULL,
    "vorauszahlungGesamt" DECIMAL(10,2) NOT NULL,
    "saldo" DECIMAL(10,2) NOT NULL,
    "details" JSONB,

    CONSTRAINT "nebenkostenabrechnung_positionen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dokumente" (
    "id" TEXT NOT NULL,
    "dateiname" TEXT NOT NULL,
    "speicherpfad" TEXT NOT NULL,
    "mimeType" TEXT,
    "groesseBytes" INTEGER,
    "mietvertragId" TEXT,
    "kostenpositionId" TEXT,
    "hochgeladenVon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dokumente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "typ" TEXT NOT NULL,
    "dateiname" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ergebnis" TEXT,
    "anzahlZeilen" INTEGER,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "einheiten_objektId_bezeichnung_key" ON "einheiten"("objektId", "bezeichnung");

-- CreateIndex
CREATE UNIQUE INDEX "kautionen_mietvertragId_key" ON "kautionen"("mietvertragId");

-- CreateIndex
CREATE INDEX "zahlungen_mietvertragId_periodeJahr_periodeMonat_idx" ON "zahlungen"("mietvertragId", "periodeJahr", "periodeMonat");

-- CreateIndex
CREATE UNIQUE INDEX "kostenarten_name_key" ON "kostenarten"("name");

-- CreateIndex
CREATE INDEX "kostenpositionen_objektId_jahr_idx" ON "kostenpositionen"("objektId", "jahr");

-- CreateIndex
CREATE UNIQUE INDEX "nebenkostenabrechnungen_objektId_jahr_key" ON "nebenkostenabrechnungen"("objektId", "jahr");

-- CreateIndex
CREATE UNIQUE INDEX "nebenkostenabrechnung_positionen_abrechnungId_einheitId_key" ON "nebenkostenabrechnung_positionen"("abrechnungId", "einheitId");

-- AddForeignKey
ALTER TABLE "einheiten" ADD CONSTRAINT "einheiten_objektId_fkey" FOREIGN KEY ("objektId") REFERENCES "objekte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mietvertraege" ADD CONSTRAINT "mietvertraege_einheitId_fkey" FOREIGN KEY ("einheitId") REFERENCES "einheiten"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mietvertraege" ADD CONSTRAINT "mietvertraege_mieterId_fkey" FOREIGN KEY ("mieterId") REFERENCES "mieter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kautionen" ADD CONSTRAINT "kautionen_mietvertragId_fkey" FOREIGN KEY ("mietvertragId") REFERENCES "mietvertraege"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zahlungen" ADD CONSTRAINT "zahlungen_mietvertragId_fkey" FOREIGN KEY ("mietvertragId") REFERENCES "mietvertraege"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kostenpositionen" ADD CONSTRAINT "kostenpositionen_kostenartId_fkey" FOREIGN KEY ("kostenartId") REFERENCES "kostenarten"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kostenpositionen" ADD CONSTRAINT "kostenpositionen_objektId_fkey" FOREIGN KEY ("objektId") REFERENCES "objekte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nebenkostenabrechnungen" ADD CONSTRAINT "nebenkostenabrechnungen_objektId_fkey" FOREIGN KEY ("objektId") REFERENCES "objekte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nebenkostenabrechnung_positionen" ADD CONSTRAINT "nebenkostenabrechnung_positionen_abrechnungId_fkey" FOREIGN KEY ("abrechnungId") REFERENCES "nebenkostenabrechnungen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nebenkostenabrechnung_positionen" ADD CONSTRAINT "nebenkostenabrechnung_positionen_einheitId_fkey" FOREIGN KEY ("einheitId") REFERENCES "einheiten"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nebenkostenabrechnung_positionen" ADD CONSTRAINT "nebenkostenabrechnung_positionen_mietvertragId_fkey" FOREIGN KEY ("mietvertragId") REFERENCES "mietvertraege"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dokumente" ADD CONSTRAINT "dokumente_mietvertragId_fkey" FOREIGN KEY ("mietvertragId") REFERENCES "mietvertraege"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dokumente" ADD CONSTRAINT "dokumente_kostenpositionId_fkey" FOREIGN KEY ("kostenpositionId") REFERENCES "kostenpositionen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
