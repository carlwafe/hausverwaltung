-- DropForeignKey
ALTER TABLE "mietvertraege" DROP CONSTRAINT "mietvertraege_mieterId_fkey";

-- CreateTable
CREATE TABLE "_MieterToMietvertrag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_MieterToMietvertrag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_MieterToMietvertrag_B_index" ON "_MieterToMietvertrag"("B");

-- AddForeignKey
ALTER TABLE "_MieterToMietvertrag" ADD CONSTRAINT "_MieterToMietvertrag_A_fkey" FOREIGN KEY ("A") REFERENCES "mieter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MieterToMietvertrag" ADD CONSTRAINT "_MieterToMietvertrag_B_fkey" FOREIGN KEY ("B") REFERENCES "mietvertraege"("id") ON DELETE CASCADE ON UPDATE CASCADE;

