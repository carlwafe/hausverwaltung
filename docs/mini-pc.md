# App auf dem eigenen Mini-PC

Teil der Fachdokumentation (Index: `CLAUDE.md` → „Fachdokumentation“).

## Aufbau

Docker Compose (`docker-compose.yml`) startet drei Container: Postgres 17 (`db`), die App (`app`, `Dockerfile`) und den Cloudflare Tunnel (`tunnel`). Daten liegen in `./daten/postgres` (Datenbank) und `./daten/storage` (Belege/Fotos, entspricht `var/storage`). Der Datei-Speicher nutzt automatisch den Ordner statt Vercel Blob, solange `VERCEL` nicht gesetzt ist (`src/lib/storage.ts`). Werte stehen in der Datei `.env` neben der Compose-Datei (Vorlage `.env.server.example`).

## Regeln

- **Datenbank gehört mit auf den Mini-PC.** Bleibt sie bei Neon (Frankfurt), kostet jede Abfrage über das Internet 20–40 ms und die App wird langsamer als auf Vercel.
- **Nie zwei Instanzen auf getrennte Datenbanken schreiben lassen.** Nach dem Umzug die Git-Integration bei Vercel trennen, sonst läuft dort bei jedem Push `prisma migrate deploy` gegen die alte Neon-Datenbank.
- **Zeitzone bleibt UTC** (wie auf Vercel); `TZ` nicht setzen.
- **Nächtlicher Abgleich des Vertragsstatus:** Vercel Cron gibt es dort nicht. `CRON_SECRET` in `.env` setzen und per `crontab -e` z.B. `15 23 * * * curl -fsS -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/vertragsstatus` eintragen (siehe `docs/mietvertraege-mieter.md` → Vertragsstatus).
- **Backup ist Pflicht** (siehe unten), Neon hat vorher gesichert.
- Die Verfügbarkeit hängt an Strom und Internet des Mini-PCs: USV und „Restore on AC Power Loss“ im BIOS.

## Einrichtung (einmalig)

1. **Ubuntu Server 24.04 LTS installieren** (USB-Stick mit balenaEtcher, Installer-Standard, „OpenSSH server“ ankreuzen). Im Router dem Mini-PC eine feste IP geben, im BIOS „Restore on AC Power Loss → Power On“ setzen. Danach `sudo apt update && sudo apt upgrade -y`.
2. **Docker installieren:** `curl -fsSL https://get.docker.com | sh`, dann `sudo usermod -aG docker $USER` und neu anmelden.
3. **Domain und Tunnel:** Domain bei Cloudflare anlegen (oder dorthin umziehen). Im Cloudflare-Dashboard unter Zero Trust → Networks → Tunnels einen Tunnel „Docker“ anlegen, den Token kopieren und als `TUNNEL_TOKEN` in `.env` eintragen. Als Public Hostname `app.<domain>` mit Ziel `http://app:3000` eintragen. Optional unter Zero Trust → Access eine Anwendung davorsetzen (Zugang per E-Mail-Einmalcode).
4. **Code holen:** `git clone <Repo> mietverwaltung && cd mietverwaltung`, dann `cp .env.server.example .env` und alle Werte ausfüllen (`NEXTAUTH_URL` = `https://app.<domain>`, `NEXTAUTH_SECRET` neu erzeugen oder das von Vercel übernehmen).
5. **Datenbank starten und füllen:** `docker compose up -d db`. Dump von Neon ziehen (Direktverbindung, Host ohne `-pooler`; der Postgres-17-Client passt zu Neon):
   ```bash
   docker run --rm postgres:17-alpine pg_dump -Fc --no-owner "<NEON-URL>" > eutin.dump
   docker compose exec -T db pg_restore --no-owner -U mietverwaltung -d mietverwaltung < eutin.dump
   ```
   Danach prüfen: `docker compose exec db psql -U mietverwaltung -c "select count(*) from buchungen;"` — Zahl mit Neon vergleichen. Die Unveränderbarkeits-Trigger kommen im Dump mit.
6. **Dateien aus Vercel Blob holen** (am Mac oder Mini-PC im Projektordner): `npx vercel env pull .env.blob.local`, dann `set -a; . ./.env.blob.local; set +a; ZIEL_ORDNER=./daten/storage node scripts/blob-nach-lokal.mjs`. Das Skript ist wiederholbar (vorhandene Dateien werden übersprungen).
7. **App bauen und starten:** `export APP_VERSION=$(git rev-parse --short HEAD) && docker compose up -d --build`. Der Build braucht ca. 3–4 GB RAM. Beim Start laufen die Migrationen. Logs: `docker compose logs -f app`.
8. **Prüfen:** `https://app.<domain>` öffnen, anmelden, einen Mietvertrag, einen Beleg und den Kontoauszug-Import testen.

## Updates

```bash
git pull && export APP_VERSION=$(git rev-parse --short HEAD) && docker compose up -d --build
```

Der Container führt die neuen Migrationen beim Start aus. Vorher ein Backup ziehen, wenn die Änderung eine Migration enthält.

## Backup

Täglich per `cron` (`crontab -e`) Datenbank und Dateien sichern, verschlüsselt auf ein Ziel außerhalb des Mini-PCs (z.B. `restic` auf eine Hetzner Storage Box oder Backblaze, zusätzlich eine externe Platte):

```bash
docker compose exec -T db pg_dump -Fc -U mietverwaltung mietverwaltung > daten/backup/db-$(date +%F).dump
```

`daten/storage` wird direkt mitgesichert. **Rückspielen mindestens einmal testen** (leere Datenbank, `pg_restore`, Beleg öffnen).

## Rückfall auf Vercel/Neon

Vercel und Neon nach dem Umzug noch einige Wochen unverändert lassen. Ihr Datenstand ist aber ab dem Umzug veraltet; ein Rückfall heißt, den aktuellen Dump zurück nach Neon zu spielen.
