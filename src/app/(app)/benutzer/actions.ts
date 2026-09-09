"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

const userSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  email: z.string().email("Ungültige E-Mail"),
  password: z.string().min(8, "Passwort muss mindestens 8 Zeichen haben"),
  role: z.enum(["ADMIN", "GAST"]),
});

export async function createBenutzer(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireAdmin();

  const parsed = userSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return parsed.error.issues.map((i) => i.message).join(", ");
  }

  const email = parsed.data.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return "Ein Benutzer mit dieser E-Mail existiert bereits.";
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  await prisma.user.create({
    data: { name: parsed.data.name, email, passwordHash, role: parsed.data.role },
  });

  revalidatePath("/benutzer");
  return null;
}

export async function deleteBenutzer(id: string) {
  const admin = await requireAdmin();
  if (admin.id === id) {
    throw new Error("Du kannst dich nicht selbst löschen.");
  }
  await prisma.user.delete({ where: { id } });
  revalidatePath("/benutzer");
}
