// One-time copy of all data from the old Railway Postgres database into Supabase.
//
// Usage (after `npm run prisma:deploy` has created the tables in Supabase):
//   1. Put the old Railway connection string in .env as SOURCE_DATABASE_URL
//   2. Make sure DIRECT_URL in .env points at Supabase (direct / session connection, port 5432)
//   3. npm run copy-data
//
// Safe to re-run: rows that already exist (same id) are skipped. IDs are preserved,
// so users keep their passwords, 2FA and admin flags, and bookings keep their links.
import { PrismaClient } from "@prisma/client";

const sourceUrl = process.env.SOURCE_DATABASE_URL;
const targetUrl = process.env.DIRECT_URL;

if (!sourceUrl || !targetUrl) {
  console.error("Set SOURCE_DATABASE_URL (Railway) and DIRECT_URL (Supabase) in .env first.");
  process.exit(1);
}
if (sourceUrl === targetUrl) {
  console.error("SOURCE_DATABASE_URL and DIRECT_URL are the same database. Aborting.");
  process.exit(1);
}

const source = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
const target = new PrismaClient({ datasources: { db: { url: targetUrl } } });

// Parents before children so foreign keys are satisfied
const tables = ["user", "game", "booking", "passwordResetToken"];

async function main() {
  for (const table of tables) {
    const rows = await source[table].findMany();
    const { count } = rows.length
      ? await target[table].createMany({ data: rows, skipDuplicates: true })
      : { count: 0 };
    const total = await target[table].count();
    console.log(`${table}: ${rows.length} in Railway, ${count} copied, ${total} now in Supabase`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await source.$disconnect();
    await target.$disconnect();
  });
