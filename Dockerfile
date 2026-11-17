# Mietverwaltung Eutin — Container für den eigenen Server (Mini-PC), Anleitung: docs/mini-pc.md
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Abhängigkeiten zuerst (Docker-Cache); `postinstall` ruft `prisma generate` auf und braucht Schema + Config.
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma7.config.ts ./
RUN npm ci

COPY . .
# Nur der Next-Build (ohne wake-db/migrate aus `npm run build`): Die Datenbank ist beim Image-Bau nicht da.
# Die Migrationen laufen beim Start des Containers.
RUN npx prisma generate && npx next build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate-with-retry.mjs && npx next start -H 0.0.0.0 -p 3000"]
