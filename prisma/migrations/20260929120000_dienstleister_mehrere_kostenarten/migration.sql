-- Dienstleister: mehrere (auch keine) Kostenarten statt genau einer
CREATE TABLE "_DienstleisterToKostenart" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DienstleisterToKostenart_AB_pkey" PRIMARY KEY ("A","B")
);

CREATE INDEX "_DienstleisterToKostenart_B_index" ON "_DienstleisterToKostenart"("B");

ALTER TABLE "_DienstleisterToKostenart" ADD CONSTRAINT "_DienstleisterToKostenart_A_fkey" FOREIGN KEY ("A") REFERENCES "dienstleister"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_DienstleisterToKostenart" ADD CONSTRAINT "_DienstleisterToKostenart_B_fkey" FOREIGN KEY ("B") REFERENCES "kostenarten"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "_DienstleisterToKostenart" ("A", "B") SELECT "id", "kostenartId" FROM "dienstleister";

ALTER TABLE "dienstleister" DROP CONSTRAINT "dienstleister_kostenartId_fkey";
DROP INDEX "dienstleister_kostenartId_idx";
ALTER TABLE "dienstleister" DROP COLUMN "kostenartId";

-- Vertrag eines Dienstleisters als Dokument
ALTER TABLE "dokumente" ADD COLUMN "dienstleisterId" TEXT;
ALTER TABLE "dokumente" ADD CONSTRAINT "dokumente_dienstleisterId_fkey" FOREIGN KEY ("dienstleisterId") REFERENCES "dienstleister"("id") ON DELETE CASCADE ON UPDATE CASCADE;
