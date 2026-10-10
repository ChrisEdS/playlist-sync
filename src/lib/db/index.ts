import fs from "fs";
import path from "path";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema";

type AppDb =
  | ReturnType<typeof drizzleNeon<typeof schema>>
  | ReturnType<typeof drizzlePglite<typeof schema>>;

let _db: AppDb | null = null;
let _init: Promise<AppDb> | null = null;

async function initPglite(): Promise<AppDb> {
  const dataDir = path.join(process.cwd(), "data", "pglite");
  fs.mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  await client.waitReady;
  const db = drizzlePglite(client, { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

async function initNeon(url: string): Promise<AppDb> {
  const sql = neon(url);
  return drizzleNeon(sql, { schema });
}

export async function getDb(): Promise<AppDb> {
  if (_db) return _db;
  if (!_init) {
    const url = process.env.DATABASE_URL?.trim();
    _init = url ? initNeon(url) : initPglite();
  }
  _db = await _init;
  return _db;
}

export type Database = AppDb;
export { schema };
