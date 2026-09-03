import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  let objekt = await prisma.objekt.findFirst();
  if (!objekt) {
    objekt = await prisma.objekt.create({
      data: {
        name: "Mietobjekt Eutin",
        strasse: "Bitte anpassen",
        hausnummer: "0",
        plz: "23701",
        ort: "Eutin",
        beschreibung: "63 Mieteinheiten",
      },
    });
    console.log("Objekt angelegt (Adresse bitte im nächsten Schritt anpassen):", objekt.id);
  } else {
    console.log("Objekt existiert bereits:", objekt.id);
  }

  const adminEmail = "cfwaller@hotmail.com";
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (!existingAdmin) {
    const password = crypto.randomBytes(9).toString("base64url");
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: { email: adminEmail, name: "Admin", passwordHash, role: "ADMIN" },
    });
    console.log("\n=== Admin-Zugang erstellt ===");
    console.log("E-Mail:   ", adminEmail);
    console.log("Passwort: ", password);
    console.log("Bitte nach dem ersten Login unter /benutzer ein neues Passwort-Konto anlegen und dieses hier entfernen.\n");
  } else {
    console.log("Admin-Benutzer existiert bereits:", adminEmail);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
