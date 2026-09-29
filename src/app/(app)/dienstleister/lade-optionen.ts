import { prisma } from "@/lib/prisma";

export async function ladeKostenartenOptionen() {
  const kostenarten = await prisma.kostenart.findMany({ orderBy: { name: "asc" } });
  return kostenarten.map((k) => ({ id: k.id, label: k.name }));
}
