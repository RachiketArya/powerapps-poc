import fs from "node:fs";
import { defaultDbFile, openDb } from "../kernel/db.js";
import { seed } from "../kernel/seed.js";

const file = defaultDbFile();
for (const suffix of ["", "-wal", "-shm"]) {
  fs.rmSync(`${file}${suffix}`, { force: true });
}
const db = openDb(file);
seed(db);
console.log(`Deleted and re-created ${file} with synthetic demo data`);
