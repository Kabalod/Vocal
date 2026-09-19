# PostgreSQL Prisma commands

CLI scripts and `postinstall` load `.env` then `.env.local` (shell env wins), matching Next.js. Values only in `.env.local` are enough for the Prisma picker.

`npm install` / `postinstall` runs `node scripts/prisma-generate.cjs`. That script **does not** generate SQLite if `DATABASE_URL` is `postgres://` or `postgresql://`, or if `VOCAL_PRISMA_SCHEMA` is set.

## Generate

```bash
npm run db:generate
```

Equivalent:

```bash
# sqlite (tests / local file DB)
npx prisma generate --schema prisma/schema.prisma

# postgres (app DATABASE_URL is postgres)
npx prisma generate --schema prisma/schema.postgres.prisma
```

## Schema on the database

SQLite migrations: `npx prisma migrate deploy --schema prisma/schema.prisma`

Postgres (no sqlite migration history): `npx prisma db push --schema prisma/schema.postgres.prisma`

With env:

```bash
set DATABASE_URL=%POSTGRES_DATABASE_URL%
set VOCAL_PRISMA_SCHEMA=prisma/schema.postgres.prisma
npm run db:generate
npm run db:migrate:postgres
```

## Build and run

```bash
set DATABASE_URL=%POSTGRES_DATABASE_URL%
set VOCAL_PRISMA_SCHEMA=prisma/schema.postgres.prisma
npm run db:generate
npm run build
npm start
```

PowerShell:

```powershell
$env:DATABASE_URL = $env:POSTGRES_DATABASE_URL
$env:VOCAL_PRISMA_SCHEMA = "prisma/schema.postgres.prisma"
npm run db:generate
npm run build
npm start
```

Do not run `npx prisma generate` without `--schema` after a Postgres generate if `DATABASE_URL` is still a `file:` URL: that would rebuild the SQLite client. Use `npm run db:generate` so the picker follows `DATABASE_URL`.
