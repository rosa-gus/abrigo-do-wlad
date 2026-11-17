import assert from 'node:assert/strict';
import { test } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { dependencyViolation, findCycles, checkArchitecture } from './check-architecture.mjs';

test('contracts, domain and application reject reversed dependencies including types', () => {
  for (const [from, to] of [
    ['packages/contracts/src/dogs.ts', 'packages/domain/src/dogs/archive.ts'],
    ['packages/domain/src/dogs/archive.ts', 'packages/backend/src/adapters/firestore.ts'],
    ['packages/backend/src/application/dogs.ts', 'packages/backend/src/adapters/firestore.ts'],
    ['packages/backend/src/ports/dogs.ts', 'packages/backend/src/http/revision.ts'],
    ['packages/backend/src/adapters/firestore.ts', 'workers/shared/api/_lib/firestore.ts'],
    ['packages/backend/src/adapters/firestore.ts', 'apps/admin/worker/access.ts'],
    ['apps/public/src/page.ts', 'packages/backend/src/adapters/firestore.ts'],
    ['apps/admin/src/page.ts', 'packages/domain/src/publication.ts'],
    ['workers/cron/composition.ts', 'workers/shared/api/dogs/feed.ts'],
  ]) assert.ok(dependencyViolation(from, to), `${from} -> ${to}`);
  for (const [from, to] of [
    ['packages/contracts/src/dogs.ts', 'packages/contracts/src/entities.ts'],
    ['packages/domain/src/publication.ts', 'packages/contracts/src/publication.ts'],
    ['packages/backend/src/application/dogs.ts', 'packages/backend/src/ports/dogs.ts'],
    ['packages/backend/src/adapters/firestore.ts', 'packages/backend/src/application/dogs.ts'],
    ['apps/admin/worker/composition.ts', 'packages/backend/src/adapters/firestore.ts'],
    ['apps/admin/src/mocks/adminApi.ts', 'packages/domain/src/publication.ts'],
  ]) assert.equal(dependencyViolation(from, to), undefined, `${from} -> ${to}`);
});

test('detects runtime server cycles while allowing erased type edges', () => {
  const a = 'packages/backend/src/application/a.ts';
  const b = 'packages/backend/src/ports/b.ts';
  assert.deepEqual(findCycles(new Map([[a, [{ to: b, typeOnly: false }]], [b, [{ to: a, typeOnly: false }]]])), [[a, b, a]]);
  assert.deepEqual(findCycles(new Map([[a, [{ to: b, typeOnly: false }]], [b, [{ to: a, typeOnly: true }]]])), []);
});

test('checks transitive frontend imports, runtime capabilities and type-only violations', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'abrigo-architecture-'));
  try {
    const files = {
      'apps/public/src/main.ts': 'import "../../../packages/ui/src/bridge.mjs";',
      'packages/ui/src/bridge.mjs': 'export * from "../../backend/src/adapters/secret";',
      'packages/ui/src/bridge.d.mts': 'export declare const harmlessType: string;',
      'packages/backend/src/adapters/secret.ts': 'export const marker = 1;',
      'packages/backend/src/application/wrong.ts': 'import type { marker } from "../adapters/secret"; export type Wrong = typeof marker;',
      'packages/domain/src/wrong.ts': 'export function load() { return fetch("https://example.test"); }',
      'packages/contracts/src/dynamic.ts': 'const location = "./other"; export const lazy = () => import(location);',
    };
    for (const [name, content] of Object.entries(files)) {
      const filename = path.join(root, name);
      mkdirSync(path.dirname(filename), { recursive: true });
      writeFileSync(filename, content);
    }
    const { violations } = checkArchitecture(root);
    assert.ok(violations.some(line => line.startsWith('frontend reaches server code:')));
    assert.ok(violations.some(line => line.includes('pure code references runtime capability fetch')));
    assert.ok(violations.some(line => line.includes('application and ports must not depend on infrastructure')));
    assert.ok(violations.some(line => line.includes('dynamic imports must use a literal path')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('requires cross-workspace imports to be declared in the source manifest', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'abrigo-workspace-dependency-'));
  try {
    const files = {
      'packages/backend/package.json': JSON.stringify({ name: '@abrigo/backend', dependencies: {} }),
      'packages/media/package.json': JSON.stringify({ name: '@abrigo/media' }),
      'packages/backend/src/adapters/metadata.ts': 'import "../../../media/src/image";',
      'packages/media/src/image.ts': 'export const image = "public";',
    };
    for (const [name, content] of Object.entries(files)) {
      const filename = path.join(root, name);
      mkdirSync(path.dirname(filename), { recursive: true });
      writeFileSync(filename, content);
    }
    assert.ok(checkArchitecture(root).violations.some(line => line.includes('undeclared workspace dependency @abrigo/media')));
    writeFileSync(path.join(root, 'packages/backend/package.json'), JSON.stringify({ name: '@abrigo/backend', dependencies: { '@abrigo/media': '*' } }));
    assert.deepEqual(checkArchitecture(root).violations, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
