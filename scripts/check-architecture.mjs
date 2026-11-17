import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const ts = createRequire(path.resolve('package.json'))('typescript');

const ignoredDirectories = new Set(['node_modules', '.git', '.wrangler', 'dist', 'coverage']);
const sourcePattern = /\.(?:ts|tsx|mjs|mts)$/;
const testPattern = /(?:\.test\.|\/test\/|\/tests\/|\.d\.(?:ts|mts|cts)$|worker-configuration)/;
const protectedPackage = /^(?:packages\/(?:contracts|domain|backend)\/src\/)/;
const frontend = /^apps\/(?:admin|public)\/src\//;
const frontendMock = /^apps\/(?:admin|public)\/src\/mocks\//;
const backend = /^packages\/backend\/src\//;
const server = /^(?:apps\/admin\/worker\/|workers\/|packages\/backend\/src\/)/;
const pure = /^packages\/(?:contracts|domain)\/src\/|^packages\/backend\/src\/(?:application|ports)\//;

export function dependencyViolation(from, to) {
  if (from.startsWith('packages/contracts/src/') && !to.startsWith('packages/contracts/src/')) return 'contracts may depend only on contracts';
  if (from.startsWith('packages/domain/src/') && !/^packages\/(?:domain|contracts)\/src\//.test(to)) return 'domain may depend only on domain and contracts';
  if (backend.test(from) && /^(?:apps|workers|scripts)\//.test(to)) return 'backend must not depend on entrypoints or legacy facades';
  if (/^packages\/backend\/src\/(?:application|ports)\//.test(from)
      && !/^packages\/(?:contracts|domain)\/src\/|^packages\/backend\/src\/(?:application|ports)\//.test(to)) return 'application and ports must not depend on infrastructure or HTTP';
  if (frontend.test(from) && (server.test(to) || backend.test(to))) return 'frontend must not import server code';
  if (frontend.test(from) && !frontendMock.test(from) && to.startsWith('packages/domain/src/')) return 'production frontend must use contracts; pure domain is allowed only in mocks';
  if (/^(?:apps\/admin\/worker\/|workers\/(?:app|cron)\/)/.test(from) && to.startsWith('workers/shared/')) return 'entrypoints must use canonical backend modules rather than legacy facades';
  return undefined;
}

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (ignoredDirectories.has(entry.name)) return [];
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(filename) : sourcePattern.test(filename) ? [filename] : [];
  });
}

function imports(source) {
  const results = [];
  function add(specifier, typeOnly = false) {
    if (specifier && ts.isStringLiteralLike(specifier)) results.push({ specifier: specifier.text, typeOnly });
  }
  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      const bindings = node.importClause?.namedBindings;
      const namedTypesOnly = bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every(element => element.isTypeOnly);
      add(node.moduleSpecifier, Boolean(node.importClause?.isTypeOnly || (!node.importClause?.name && namedTypesOnly)));
    } else if (ts.isExportDeclaration(node)) {
      const namedTypesOnly = node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.length > 0 && node.exportClause.elements.every(element => element.isTypeOnly);
      add(node.moduleSpecifier, Boolean(node.isTypeOnly || namedTypesOnly));
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) add(node.argument.literal, true);
    else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
      if (node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) add(node.arguments[0]);
      else results.push({ specifier: undefined, typeOnly: false });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return results;
}

export function findCycles(graph) {
  const complete = new Set();
  const active = new Map();
  const stack = [];
  const cycles = [];
  function visit(filename) {
    if (active.has(filename)) {
      const cycle = [...stack.slice(active.get(filename)), filename];
      if (cycle.some(file => protectedPackage.test(file) || server.test(file))) cycles.push(cycle);
      return;
    }
    if (complete.has(filename)) return;
    active.set(filename, stack.length);
    stack.push(filename);
    for (const edge of graph.get(filename) ?? []) if (!edge.typeOnly) visit(edge.to);
    stack.pop();
    active.delete(filename);
    complete.add(filename);
  }
  for (const filename of graph.keys()) visit(filename);
  return cycles;
}

export function checkArchitecture(root = process.cwd()) {
  const relative = filename => path.relative(root, filename).split(path.sep).join('/');
  const files = ['apps', 'workers', 'packages', 'scripts/migrations'].flatMap(directory => walk(path.join(root, directory))).filter(file => !testPattern.test(relative(file)));
  const filenames = new Set(files.map(file => path.resolve(file)));
  const graph = new Map();
  const violations = [];
  const owners = new Map();
  function owner(filename) {
    const parts = filename.split('/');
    const directory = ['apps', 'packages'].includes(parts[0]) ? parts.slice(0, 2).join('/') : '';
    if (!owners.has(directory)) {
      const manifest = path.join(root, directory, 'package.json');
      owners.set(directory, existsSync(manifest) ? { directory, ...JSON.parse(readFileSync(manifest, 'utf8')) } : undefined);
    }
    return owners.get(directory);
  }
  const compilerOptions = { moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext, allowJs: true,
    baseUrl: root, paths: { '@/*': ['apps/public/src/*'] } };
  for (const filename of files) {
    const from = relative(filename);
    const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
    const edges = [];
    for (const entry of imports(source)) {
      if (entry.specifier === undefined) {
        if (protectedPackage.test(from) || frontend.test(from)) violations.push(`${from}: dynamic imports must use a literal path for boundary verification`);
        continue;
      }
      const result = ts.resolveModuleName(entry.specifier, filename, compilerOptions, ts.sys).resolvedModule;
      if (!result) {
        if (protectedPackage.test(from) && (entry.specifier.startsWith('.') || entry.specifier.startsWith('@abrigo/'))) violations.push(`${from}: unresolved import ${entry.specifier}`);
        continue;
      }
      const explicitJavaScript = entry.specifier.startsWith('.') && /\.mjs$/.test(entry.specifier)
        ? path.resolve(path.dirname(filename), entry.specifier) : undefined;
      const resolvedFilename = explicitJavaScript && existsSync(explicitJavaScript) ? explicitJavaScript : result.resolvedFileName;
      const target = path.resolve(ts.sys.realpath?.(resolvedFilename) ?? resolvedFilename);
      if (!filenames.has(target)) {
        if (pure.test(from) && /^(?:node:|crypto$|jose$)/.test(entry.specifier)) violations.push(`${from}: pure code imports ${entry.specifier}`);
        continue;
      }
      const to = relative(target);
      edges.push({ to, typeOnly: entry.typeOnly });
      const sourceOwner = owner(from);
      const targetOwner = owner(to);
      if (sourceOwner && targetOwner?.directory && sourceOwner.directory !== targetOwner.directory && targetOwner.name) {
        const declared = { ...sourceOwner.dependencies, ...sourceOwner.devDependencies, ...sourceOwner.peerDependencies, ...sourceOwner.optionalDependencies };
        if (!Object.hasOwn(declared, targetOwner.name)) violations.push(`${from} -> ${to}: undeclared workspace dependency ${targetOwner.name}`);
      }
      const reason = dependencyViolation(from, to);
      if (reason) violations.push(`${from} -> ${to}: ${reason}`);
    }
    graph.set(from, edges);
    if (pure.test(from)) {
      const forbidden = new Set(['Env', 'CloudflareEnv', 'fetch', 'Request', 'Response', 'process', 'Buffer', 'KVNamespace']);
      const found = new Set();
      function visit(node) {
        if (ts.isIdentifier(node) && forbidden.has(node.text)
            && (!(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
              || ts.isIdentifier(node.parent.expression) && ['globalThis', 'self', 'window'].includes(node.parent.expression.text))) found.add(node.text);
        ts.forEachChild(node, visit);
      }
      visit(source);
      for (const name of found) violations.push(`${from}: pure code references runtime capability ${name}`);
    }
  }
  for (const cycle of findCycles(graph)) violations.push(`runtime import cycle: ${cycle.join(' -> ')}`);
  // A safe-looking UI utility or reexport must not become a transitive server import.
  for (const entry of graph.keys()) {
    if (!frontend.test(entry)) continue;
    const queue = [[entry]];
    const seen = new Set();
    while (queue.length) {
      const chain = queue.pop();
      const current = chain.at(-1);
      if (seen.has(current)) continue;
      seen.add(current);
      if (current !== entry && (backend.test(current) || server.test(current))) {
        violations.push(`frontend reaches server code: ${chain.join(' -> ')}`);
        break;
      }
      for (const edge of graph.get(current) ?? []) queue.push([...chain, edge.to]);
    }
  }
  return { violations: [...new Set(violations)], modules: graph.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkArchitecture();
  if (result.violations.length) {
    for (const violation of result.violations) console.error(violation);
    process.exitCode = 1;
  } else console.log(`Architecture boundaries verified across ${result.modules} modules.`);
}
