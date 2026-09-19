# SQLite → Postgres migration tools

Do **not** run `npm run db:to-postgres` or `npm run db:transfer-media` against the live author database until Auth review says so.

CLI scripts call `loadVocalEnv()`: shell variables win, then `.env.local`, then `.env` — same as Next.js. Prisma picker (`scripts/prisma-generate.cjs`) loads `.env.local` before choosing sqlite vs postgres.

SQLite `file:` paths are resolved **relative to `prisma/schema.prisma`**, not the process cwd. `file:./dev.db` is `prisma/dev.db`.

Backup is mandatory: source file must exist, copy size/hash must match, or the copy stops.

`CreatorProfile` id `local` and the predetermined owner uuid cannot both exist: assign-legacy prints `PORTRAIT_CONFLICT` and writes nothing.

Media: `npm run db:transfer-media` uploads local files to `vocal-private/{owner}/…`, checks byte size, then rewrites `storedPath` / `videoPath` / `audioPath` to `vocal-private:…`. Failed upload leaves the old path.
