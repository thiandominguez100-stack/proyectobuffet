import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc
} from "firebase/firestore";

let testEnv;

before(async () => {
  const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: "demo-buffet411-enrollment",
    firestore: { rules }
  });

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "staffRoles", "admin-1"), { role: "admin" });
    await setDoc(doc(context.firestore(), "staffRoles", "staff-1"), { role: "staff" });
  });
});

after(async () => {
  await testEnv?.cleanup();
});

test("los códigos solo los emite administración y se canjean una sola vez junto al perfil", async () => {
  await testEnv.clearFirestore();

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "staffRoles", "admin-1"), { role: "admin" });
    await setDoc(doc(context.firestore(), "staffRoles", "staff-1"), { role: "staff" });
  });

  const adminDb = testEnv.authenticatedContext("admin-1", { email_verified: true }).firestore();
  const staffDb = testEnv.authenticatedContext("staff-1", { email_verified: true }).firestore();
  const studentDb = testEnv.authenticatedContext("student-1", { email_verified: false }).firestore();
  const otherStudentDb = testEnv.authenticatedContext("student-2", { email_verified: false }).firestore();

  const firstCodeHash = "a".repeat(64);
  const firstCodeRef = doc(adminDb, "enrollmentCodes", firstCodeHash);
  const codeData = {
    status: "available",
    course: "3°",
    division: "A",
    createdBy: "admin-1",
    createdAt: serverTimestamp()
  };

  await assertSucceeds(setDoc(firstCodeRef, codeData));
  await assertFails(setDoc(doc(staffDb, "enrollmentCodes", "b".repeat(64)), {
    ...codeData,
    createdBy: "staff-1"
  }));
  await assertFails(setDoc(doc(studentDb, "enrollmentCodes", "c".repeat(64)), {
    ...codeData,
    createdBy: "student-1"
  }));
  await assertFails(getDocs(collection(studentDb, "enrollmentCodes")));

  await assertFails(setDoc(doc(studentDb, "users", "student-1"), {
    uid: "student-1",
    displayName: "Alumno de prueba",
    course: "3°",
    division: "A",
    role: "student",
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }));

  await assertSucceeds(runTransaction(studentDb, async (transaction) => {
    const codeSnapshot = await transaction.get(doc(studentDb, "enrollmentCodes", firstCodeHash));
    const profileRef = doc(studentDb, "users", "student-1");
    transaction.update(doc(studentDb, "enrollmentCodes", firstCodeHash), {
      status: "redeemed",
      redeemedBy: "student-1",
      redeemedAt: serverTimestamp()
    });
    transaction.set(profileRef, {
      uid: "student-1",
      displayName: "Alumno de prueba",
      course: codeSnapshot.data().course,
      division: codeSnapshot.data().division,
      enrollmentCodeHash: firstCodeHash,
      role: "student",
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }));

  await assertFails(runTransaction(otherStudentDb, async (transaction) => {
    const codeRef = doc(otherStudentDb, "enrollmentCodes", firstCodeHash);
    await transaction.get(codeRef);
  }));

  const revokedCodeHash = "d".repeat(64);
  await assertSucceeds(setDoc(doc(adminDb, "enrollmentCodes", revokedCodeHash), {
    ...codeData,
    createdBy: "admin-1"
  }));
  await assertSucceeds(updateDoc(doc(adminDb, "enrollmentCodes", revokedCodeHash), {
    status: "revoked",
    revokedBy: "admin-1",
    revokedAt: serverTimestamp()
  }));
  await assertFails(runTransaction(otherStudentDb, async (transaction) => {
    await transaction.get(doc(otherStudentDb, "enrollmentCodes", revokedCodeHash));
  }));
});
