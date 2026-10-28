import { readFile } from "node:fs/promises";
import { after, before, beforeEach, describe, test } from "node:test";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";

const PROJECT_ID = `abrigo-rules-${process.pid}`;
let testEnvironment;

function authenticatedFirestore() {
  return testEnvironment.authenticatedContext("operator", {
    email: "operator@example.test",
    email_verified: true,
  }).firestore();
}

async function seed(path, data) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

before(async () => {
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules },
  });
});

beforeEach(async () => testEnvironment.clearFirestore());
after(async () => testEnvironment.cleanup());

describe("public data", () => {
  test("allows reads for recycle points and public settings", async () => {
    await seed("recycle_points/point-1", { name: "Point" });
    await seed("system/settings", { adoptionEnabled: true });
    const db = testEnvironment.unauthenticatedContext().firestore();

    await assertSucceeds(getDoc(doc(db, "recycle_points/point-1")));
    await assertSucceeds(getDoc(doc(db, "system/settings")));
  });
});

describe("client isolation", () => {
  for (const authenticated of [false, true]) {
    test(`rejects direct dog reads for ${authenticated ? "authenticated" : "anonymous"} clients`, async () => {
      await seed("dogs/active", { nome: "Wlad" });
      await seed("dogs/archived", {
        nome: "Wlad arquivado",
        archivedAt: "2026-10-28T12:00:00.000Z",
        archivedBy: "operator@example.test",
        fotos: ["https://example.test/dog.jpg"],
        retainedPhotos: ["https://example.test/retained.jpg"],
      });
      const db = authenticated
        ? authenticatedFirestore()
        : testEnvironment.unauthenticatedContext().firestore();

      await assertFails(getDoc(doc(db, "dogs/active")));
      await assertFails(getDoc(doc(db, "dogs/archived")));
      await assertFails(getDocs(collection(db, "dogs")));
    });
  }

  test("rejects every public write", async () => {
    const db = testEnvironment.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, "dogs/new"), { nome: "Dog" }));
    await assertFails(setDoc(doc(db, "recycle_points/new"), { name: "Point" }));
    await assertFails(setDoc(doc(db, "adoption_application/new"), { status: "pending" }));
  });

  test("authenticated clients cannot bypass the Worker API", async () => {
    await seed("dogs/wlad", { nome: "Wlad" });
    await seed("adoption_application/request-1", { status: "pending" });
    await seed("users/operator", { role: "developer" });
    await seed("system/keys", { key: "secret" });
    await seed("system/statistics", { adoptionsCount: 1 });
    await seed("admin_audit_log/event-1", { action: "dog.updated" });
    const db = authenticatedFirestore();

    await assertFails(updateDoc(doc(db, "dogs/wlad"), { nome: "Changed" }));
    await assertFails(deleteDoc(doc(db, "dogs/wlad")));
    await assertFails(getDoc(doc(db, "adoption_application/request-1")));
    await assertFails(getDoc(doc(db, "users/operator")));
    await assertFails(getDoc(doc(db, "system/keys")));
    await assertFails(getDoc(doc(db, "system/statistics")));
    await assertFails(getDoc(doc(db, "admin_audit_log/event-1")));
    await assertFails(setDoc(doc(db, "admin_audit_log/event-2"), {
      action: "dog.deleted",
    }));
  });

  test("unknown collections fail closed", async () => {
    const db = authenticatedFirestore();
    await assertFails(getDoc(doc(db, "unknown/document")));
    await assertFails(setDoc(doc(db, "unknown/document"), { value: true }));
  });
});
