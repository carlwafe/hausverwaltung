"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const schema = z
  .object({
    aktuellesPasswort: z.string().min(1, "Aktuelles Passwort ist erforderlich"),
    neuesPasswort: z.string().min(8, "Neues Passwort muss mindestens 8 Zeichen haben"),
    neuesPasswortWiederholen: z.string(),
  })
  .refine((d) => d.neuesPasswort === d.neuesPasswortWiederholen, {
    message: "Die Passwörter stimmen nicht überein",
    path: ["neuesPasswortWiederholen"],
  });

export async function changePassword(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const currentUser = await requireUser();

  const parsed = schema.safeParse({
    aktuellesPasswort: formData.get("aktuellesPasswort"),
    neuesPasswort: formData.get("neuesPasswort"),
    neuesPasswortWiederholen: formData.get("neuesPasswortWiederholen"),
  });

  if (!parsed.success) {
    return parsed.error.issues.map((i) => i.message).join(", ");
  }

  const user = await prisma.user.findUnique({ where: { id: currentUser.id } });
  if (!user) return "Benutzer nicht gefunden.";

  const valid = await bcrypt.compare(parsed.data.aktuellesPasswort, user.passwordHash);
  if (!valid) return "Aktuelles Passwort ist falsch.";

  const passwordHash = await bcrypt.hash(parsed.data.neuesPasswort, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  return "Passwort wurde geändert.";
}
