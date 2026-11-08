import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where
} from "firebase/firestore";

const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
let testEnv;

const code = "ABCDEFGHJKLMNPQR";

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-buffet411",
    firestore: { rules }
  });
});

test.after(async () => {
  await testEnv?.cleanup();
});

test.beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "staffRoles", "admin-1"), { role: "admin" });
    await setDoc(doc(db, "staffRoles", "staff-1"), { role: "staff" });
    await setDoc(doc(db, "users", "student-1"), {
      uid: "student-1",
      displayName: "Alumno de prueba",
      course: "3°",
      division: "A",
      registrationCodeId: code,
      role: "student",
      active: true
    });
    await setDoc(doc(db, "dailyOrderTotals", "student-1_20261201"), {
      uid: "student-1",
      serviceDateNumber: 20261201,
      quantity: 3,
      orderCount: 1,
      latestOrderId: "order-1"
    });
    await setDoc(doc(db, "orders", "order-1"), {
      uid: "student-1",
      displayName: "Alumno de prueba",
      course: "3°",
      division: "A",
      serviceDateNumber: 20261201,
      dailyTotalId: "student-1_20261201",
      items: { bizcochos: 3, facturas: 0 },
      quantity: 3,
      total: 1500,
      pickupSlot: "primer-recreo",
      paymentMethod: "cash",
      paymentStatus: "unpaid",
      status: "pending"
    });
    await setDoc(doc(db, "enrollmentCodes", code), {
      status: "available",
      createdAt: new Date(),
      createdBy: "admin-1"
    });
    await setDoc(doc(db, "schoolDays", "20261201"), {
      open: false,
      label: "Cierre de prueba",
      updatedAt: new Date()
    });
  });
});

function registrationTransaction(db, uid, enrollmentCode) {
  return runTransaction(db, async (transaction) => {
    const codeRef = doc(db, "enrollmentCodes", enrollmentCode);
    const codeSnapshot = await transaction.get(codeRef);
    if (!codeSnapshot.exists() || codeSnapshot.data().status !== "available") {
      throw new Error("Código no disponible");
    }

    const userRef = doc(db, "users", uid);
    transaction.set(userRef, {
      uid,
      displayName: "Nuevo alumno",
      course: "2°",
      division: "B",
      registrationCodeId: enrollmentCode,
      role: "student",
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    transaction.update(codeRef, {
      status: "used",
      usedBy: uid,
      usedAt: serverTimestamp()
    });
  });
}

test("un administrador puede emitir un código válido", async () => {
  const db = testEnv.authenticatedContext("admin-1").firestore();
  const newCode = "BCDEFGHJKLMNPQRS";
  await assertSucceeds(setDoc(doc(db, "enrollmentCodes", newCode), {
    status: "available",
    createdAt: serverTimestamp(),
    createdBy: "admin-1"
  }));
});

test("un alumno puede consumir un código una sola vez al crear su perfil", async () => {
  const db = testEnv.authenticatedContext("student-2", {
    email_verified: false
  }).firestore();

  await assertSucceeds(registrationTransaction(db, "student-2", code));

  const profile = await getDoc(doc(db, "users", "student-2"));
  assert.equal(profile.data().registrationCodeId, code);

  const usedCode = await getDoc(doc(db, "enrollmentCodes", code));
  assert.equal(usedCode.data().status, "used");
  assert.equal(usedCode.data().usedBy, "student-2");
});

test("un segundo alumno no puede reutilizar un código consumido", async () => {
  const firstDb = testEnv.authenticatedContext("student-2", {
    email_verified: false
  }).firestore();
  await assertSucceeds(registrationTransaction(firstDb, "student-2", code));

  const secondDb = testEnv.authenticatedContext("student-3", {
    email_verified: false
  }).firestore();
  await assertFails(registrationTransaction(secondDb, "student-3", code));
  const missingProfile = await assertSucceeds(getDoc(doc(secondDb, "users", "student-3")));
  assert.equal(missingProfile.exists(), false);
});

test("un alumno no puede crear un perfil sin código ni consumirlo por separado", async () => {
  const db = testEnv.authenticatedContext("student-2", {
    email_verified: false
  }).firestore();

  await assertFails(setDoc(doc(db, "users", "student-2"), {
    uid: "student-2",
    displayName: "Nuevo alumno",
    course: "2°",
    division: "B",
    role: "student",
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }));

  await assertFails(setDoc(doc(db, "enrollmentCodes", code), {
    status: "used",
    usedBy: "student-2",
    usedAt: serverTimestamp()
  }));
});

test("un alumno conoce su código pero no puede enumerar la colección", async () => {
  const db = testEnv.authenticatedContext("student-2", {
    email_verified: false
  }).firestore();

  await assertSucceeds(getDoc(doc(db, "enrollmentCodes", code)));
  await assertFails(getDocs(query(
    collection(db, "enrollmentCodes"),
    where("status", "==", "available")
  )));
});

test("el personal puede consultar pedidos pero no enumerar perfiles ni leer contadores privados", async () => {
  const db = testEnv.authenticatedContext("staff-1").firestore();

  const orders = await assertSucceeds(getDocs(query(
    collection(db, "orders"),
    where("serviceDateNumber", "==", 20261201)
  )));
  assert.equal(orders.size, 1);

  await assertFails(getDocs(collection(db, "users")));
  await assertFails(getDoc(doc(db, "users", "student-1")));
  await assertFails(getDoc(doc(db, "dailyOrderTotals", "student-1_20261201")));
});

test("el alumno solo puede leer su perfil y su contador diario", async () => {
  const db = testEnv.authenticatedContext("student-1", {
    email_verified: true
  }).firestore();

  await assertSucceeds(getDoc(doc(db, "users", "student-1")));
  await assertSucceeds(getDoc(doc(db, "dailyOrderTotals", "student-1_20261201")));
  await assertFails(getDoc(doc(db, "users", "student-2")));
});

test("solo administración puede enumerar perfiles y códigos", async () => {
  const db = testEnv.authenticatedContext("admin-1").firestore();

  const users = await assertSucceeds(getDocs(collection(db, "users")));
  assert.equal(users.size, 1);

  const codes = await assertSucceeds(getDocs(collection(db, "enrollmentCodes")));
  assert.equal(codes.size, 1);
});


test("solo administración puede eliminar un cierre del calendario escolar", async () => {
  const adminDb = testEnv.authenticatedContext("admin-1").firestore();
  await assertSucceeds(deleteDoc(doc(adminDb, "schoolDays", "20261201")));

  const staffDb = testEnv.authenticatedContext("staff-1").firestore();
  await assertFails(deleteDoc(doc(staffDb, "schoolDays", "20261201")));
});
