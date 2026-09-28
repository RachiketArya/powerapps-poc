import { defaultDbFile, openDb } from "../kernel/db.js";
import { seed } from "../kernel/seed.js";

const file = defaultDbFile();
const db = openDb(file);
seed(db);
console.log(`Re-seeded synthetic demo data into ${file}`);
