import { createApp } from "./app.js";
import { defaultDbFile, openDb } from "../kernel/db.js";
import { seed } from "../kernel/seed.js";

const PRODUCTION_HINTS = ["production", "prod", "staging"];

function refuseProductionMode(): void {
  const env = (process.env.NODE_ENV ?? "development").toLowerCase();
  const appEnv = (process.env.APP_ENV ?? "").toLowerCase();
  if (PRODUCTION_HINTS.includes(env) || PRODUCTION_HINTS.includes(appEnv)) {
    console.error(
      [
        "Control Room refuses to start outside local demo mode.",
        `NODE_ENV='${env}' APP_ENV='${appEnv}'.`,
        "Identity here is a demo selector, not authentication: any caller can assume any",
        "seeded identity. Wire real authentication and authorization before running this",
        "anywhere other than localhost.",
      ].join("\n"),
    );
    process.exit(1);
  }
}

refuseProductionMode();

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";
const dbFile = defaultDbFile();
const db = openDb(dbFile);

const userCount = (db.prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number }).n;
if (userCount === 0) {
  seed(db);
  console.log(`Seeded synthetic demo data into ${dbFile}`);
}

createApp(db).listen(port, host, () => {
  console.log(`Control Room API (demo mode, synthetic data) on http://${host}:${port}`);
  console.log(`SQLite: ${dbFile}`);
});
