/** Delete the SQLite database, re-run migrations and seed demo data. */
import { rmSync } from "node:fs";
import { loadConfig } from "../config";

const { databasePath } = loadConfig();
if (databasePath !== ":memory:") {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(databasePath + suffix, { force: true });
  console.log(`✔ Removed ${databasePath}`);
}

await import("./seed");
