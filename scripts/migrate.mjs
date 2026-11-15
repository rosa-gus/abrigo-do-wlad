import { pathToFileURL } from "node:url";
import { createMigrationStore } from "./migrations/firestore.mjs";
import { loadMigrations } from "./migrations/registry.mjs";
import { MigrationRunner } from "./migrations/runner.mjs";

export function parseArguments(args) {
  const [command, ...flags] = args;
  if (!["status", "plan", "up"].includes(command)) throw new Error("Use status, plan or up.");
  const options = { command, batchSize: 100, apply: false, rescan: false };
  const seen = new Set();
  for (let index = 0; index < flags.length; index++) {
    const [name, ...parts] = flags[index].split("=");
    if (seen.has(name)) throw new Error(`Repeated option: ${name}.`);
    seen.add(name);
    if (["--apply", "--rescan"].includes(name)) {
      if (parts.length) throw new Error(`Unexpected value for ${name}.`);
      options[name === "--apply" ? "apply" : "rescan"] = true;
      continue;
    }
    if (!["--project", "--to", "--batch-size"].includes(name)) throw new Error(`Unknown option: ${name}.`);
    const value = parts.length ? parts.join("=") : flags[++index];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}.`);
    if (name === "--project") options.project = value;
    if (name === "--to") options.to = value;
    if (name === "--batch-size") options.batchSize = Number(value);
  }
  if (!options.project) throw new Error("Specify --project explicitly.");
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 100) {
    throw new Error("Batch size must be between 1 and 100.");
  }
  if (command === "up" && !options.apply) throw new Error("up requires --apply; use plan to preview without writes.");
  if (command !== "up" && (options.apply || options.rescan)) throw new Error("--apply and --rescan are only valid with up.");
  if (command === "status" && options.to) throw new Error("--to is only valid with plan or up.");
  return options;
}

export async function main(args = process.argv.slice(2), environment = process.env, log = console.log) {
  if (!args.length || args.includes("--help")) {
    log("node --env-file=<runtime.env> scripts/migrate.mjs <status|plan|up> --project=<id> [--to=<migration>] [--batch-size=100]");
    log("status: history. plan: simulation without writes. up: apply/resume (requires --apply). --rescan: recheck completed migrations.");
    return;
  }
  const options = parseArguments(args);
  if (options.project !== environment.FIREBASE_PROJECT_ID) throw new Error("--project must match FIREBASE_PROJECT_ID in the runtime environment.");
  const store = createMigrationStore({
    project: options.project, email: environment.FIREBASE_CLIENT_EMAIL,
    privateKey: environment.FIREBASE_PRIVATE_KEY,
  });
  const runner = new MigrationRunner({
    store, migrations: await loadMigrations(), batchSize: options.batchSize,
    actor: environment.FIREBASE_CLIENT_EMAIL,
    log: event => log(JSON.stringify({ project: options.project, ...event })),
  });
  log(JSON.stringify({ project: options.project, database: "(default)", command: options.command }));
  const result = options.command === "status" ? await runner.status()
    : options.command === "plan" ? await runner.plan(options) : await runner.up(options);
  for (const entry of result) log(JSON.stringify(entry));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
