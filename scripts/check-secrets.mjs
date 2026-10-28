import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const excludedDirectories = new Set([
  ".agents", ".codex", ".git", ".wrangler", "coverage", "dist", "node_modules",
  "playwright-report", "test-results",
]);
const excludedFiles = new Set([".env", ".env.local", ".dev.vars"]);

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isSymbolicLink()) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return excludedDirectories.has(entry.name) ? [] : collectFiles(path);
    }
    if (!entry.isFile() || excludedFiles.has(entry.name)) return [];
    // Wrangler's per-environment runtime files are ignored by git, like .dev.vars.
    // Keep scanning the versioned example so it cannot accidentally hold secrets.
    if (entry.name.startsWith(".dev.vars.") && entry.name !== ".dev.vars.example") return [];
    return [relative(process.cwd(), path)];
  });
}

const candidates = collectFiles(process.cwd());

const binaryExtensions = new Set([
  ".gif", ".ico", ".jpeg", ".jpg", ".lock", ".pdf", ".png", ".webp", ".woff", ".woff2",
]);
const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ["Google API key", /AIza[0-9A-Za-z_-]{30,}/g],
  ["GitHub token", /gh[pousr]_[A-Za-z0-9_]{20,}/g],
  ["Slack token", /xox[baprs]-[A-Za-z0-9-]{10,}/g],
  ["Cloudinary credential URL", /cloudinary:\/\/[^\s:]+:[^\s@]+@/g],
  ["service-account private key", /"private_key"\s*:\s*"(?!replace|example)[^"]{40,}"/g],
];
const findings = [];

for (const file of candidates) {
  const extension = file.includes(".") ? file.slice(file.lastIndexOf(".")).toLowerCase() : "";
  if (binaryExtensions.has(extension) || file === "package-lock.json") continue;

  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  for (const [label, pattern] of patterns) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) findings.push(`${file}: possible ${label}`);
  }
}

if (findings.length > 0) {
  console.error("Potential credentials detected:\n" + findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Secret scan passed (${candidates.length} versionable files checked).`);
}
