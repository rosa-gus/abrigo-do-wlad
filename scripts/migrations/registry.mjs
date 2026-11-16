import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import publicationStatus from "./definitions/0001-publication-status.mjs";

export const entries = [
  [publicationStatus, new URL("./definitions/0001-publication-status.mjs", import.meta.url)],
];

export async function loadMigrations() {
  return Promise.all(entries.map(async ([migration, file]) => ({
    ...migration,
    checksum: createHash("sha256").update(await readFile(file)).digest("hex"),
  })));
}
