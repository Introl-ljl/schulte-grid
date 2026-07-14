import fs from 'node:fs/promises';
import { getSql } from './lib/db.mjs';

export async function migrate() {
  const migration = await fs.readFile(new URL('../db/001_initial.sql', import.meta.url), 'utf8');
  const sql = getSql();
  for (const statement of migration.split(/;\s*(?:\r?\n|$)/).map((item) => item.trim()).filter(Boolean)) {
    await sql.unsafe(statement);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await migrate();
  console.log('Database schema is up to date.');
  process.exit(0);
}

