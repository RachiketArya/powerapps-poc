/**
 * Records which source revision the assurance run is about to exercise.
 *
 * Run immediately before vitest by `npm run assure`. The Activity view reads
 * this alongside the vitest JSON and compares it with the current checkout, so
 * results are labelled as *a last recorded run against revision X* rather than
 * being implied to describe whatever the tree contains now. This is a staleness
 * signal, not an attestation: nothing here proves the run happened.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function git(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

const revision = git(["rev-parse", "HEAD"]);
const status = git(["status", "--porcelain"]);

fs.mkdirSync(path.join(root, "evidence"), { recursive: true });
fs.writeFileSync(
  path.join(root, "evidence", "assurance-meta.json"),
  `${JSON.stringify(
    {
      revision,
      uncommittedChanges: status === null ? null : status.length > 0,
      startedAt: new Date().toISOString(),
      command: "npm run assure",
    },
    null,
    2,
  )}\n`,
  "utf8",
);
