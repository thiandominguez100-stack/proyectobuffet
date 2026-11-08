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
  Timestamp,
  updateDoc,
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
      createdBy: "admin-1",
      course: "2°",
      division: "B"
    });
    await setDoc(doc(db, "schoolDays", "20261201"), {
      open: false,
      label: "Cierre de prueba",
      updatedAt: new Date()
    });
    await setDoc(doc(db, "dailyAvailability", "20261201"), {
      dateNumber: 20261201,
      bizcochosRemaining: 7,
      facturasRemaining: 10,
      updatedAt: new Date(),
      updatedBy: "admin-1",
      lastOrderId: "order-1",
      lastAction: "reserved"
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
      course: codeSnapshot.data().course,
      division: codeSnapshot.data().division,
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
    createdBy: "admin-1",
    course: "2°",
    division: "B"
  }));
});

test("un alumno puede consumir un código una sola vez al crear su perfil", async () => {
  const db = testEnv.authenticatedContext("student-2", {
    email_verified: false
  }).firestore();

  await assertSucceeds(registrationTransaction(db, "student-2", code));

  const profile = await getDoc(doc(db, "users", "student-2"));
  assert.equal(profile.data().registrationCodeId, code);

  let usedCodeData;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const usedCode = await getDoc(doc(context.firestore(), "enrollmentCodes", code));
    usedCodeData = usedCode.data();
  });
  assert.equal(usedCodeData.status, "used");
  assert.equal(usedCodeData.usedBy, "student-2");
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


const orderWindowParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Argentina/Cordoba",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
}).formatToParts(new Date());
const orderWindowHour = Number(orderWindowParts.find((part) => part.type === "hour")?.value);
const orderWindowWeekday = orderWindowParts.find((part) => part.type === "weekday")?.value;
const orderWindowIsOpen = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sun"].includes(orderWindowWeekday)
  && orderWindowHour >= 13 && orderWindowHour < 17;

test("un pedido reserva stock y actualiza el límite diario en una sola transacción", {
  skip: !orderWindowIsOpen
}, async () => {
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Cordoba",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
  const [year, month, day] = todayKey.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day));
  do {
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  } while (nextDay.getUTCDay() === 0 || nextDay.getUTCDay() === 6);
  const serviceDateKey = nextDay.toISOString().slice(0, 10);
  const serviceDateNumber = Number(serviceDateKey.replace(/-/g, ""));
  const serviceDateAt = Timestamp.fromDate(new Date(serviceDateKey + "T03:00:00.000Z"));

  const studentDb = testEnv.authenticatedContext("student-1", {
    email_verified: true
  }).firestore();
  const catalogRef = doc(studentDb, "settings", "catalog");
  const stockRef = doc(studentDb, "dailyAvailability", String(serviceDateNumber));
  const totalId = "student-1_" + serviceDateNumber;
  const totalRef = doc(studentDb, "dailyOrderTotals", totalId);
  const orderRef = doc(studentDb, "orders", "new-transactional-order");

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await setDoc(doc(adminDb, "settings", "catalog"), {
      products: {
        bizcochos: { price: 700, active: true },
        facturas: { price: 1200, active: true }
      },
      updatedAt: new Date(),
      updatedBy: "admin-1"
    });
    await setDoc(doc(adminDb, "dailyAvailability", String(serviceDateNumber)), {
      dateNumber: serviceDateNumber,
      bizcochosRemaining: 10,
      facturasRemaining: 10,
      updatedAt: new Date(),
      updatedBy: "admin-1",
      lastOrderId: "",
      lastAction: "configured"
    });
  });

  await assertSucceeds(runTransaction(studentDb, async (transaction) => {
    const totalSnapshot = await transaction.get(totalRef);
    const stockSnapshot = await transaction.get(stockRef);
    const catalogSnapshot = await transaction.get(catalogRef);
    const oldQuantity = totalSnapshot.exists() ? totalSnapshot.data().quantity : 0;
    const oldOrderCount = totalSnapshot.exists() ? totalSnapshot.data().orderCount : 0;
    const stock = stockSnapshot.data();
    const items = { bizcochos: 2, facturas: 1 };
    const quantity = 3;
    const total = 2 * 700 + 1 * 1200;

    transaction.set(orderRef, {
      uid: "student-1",
      displayName: "Alumno de prueba",
      course: "3°",
      division: "A",
      serviceDateAt,
      serviceDateNumber,
      dailyTotalId: totalId,
      items,
      quantity,
      total,
      pickupSlot: "primer-recreo",
      paymentMethod: "cash",
      paymentStatus: "unpaid",
      status: "pending",
      createdAt: serverTimestamp()
    });

    transaction.set(totalRef, {
      uid: "student-1",
      serviceDateNumber,
      quantity: oldQuantity + quantity,
      orderCount: oldOrderCount + 1,
      latestOrderId: orderRef.id,
      updatedAt: serverTimestamp()
    });

    transaction.update(stockRef, {
      bizcochosRemaining: stock.bizcochosRemaining - items.bizcochos,
      facturasRemaining: stock.facturasRemaining - items.facturas,
      updatedAt: serverTimestamp(),
      updatedBy: "student-1",
      lastOrderId: orderRef.id,
      lastAction: "reserved"
    });
  }));

  const savedOrder = await getDoc(orderRef);
  const savedStock = await getDoc(stockRef);
  const savedTotal = await getDoc(totalRef);
  assert.equal(savedOrder.data().total, 2600);
  assert.equal(savedStock.data().bizcochosRemaining, 8);
  assert.equal(savedStock.data().facturasRemaining, 9);
  assert.equal(savedTotal.data().quantity, 3);
});

test("solo administración puede modificar precios y activar productos", async () => {
  const adminDb = testEnv.authenticatedContext("admin-1").firestore();
  const catalog = {
    products: {
      bizcochos: { price: 700, active: true },
      facturas: { price: 1200, active: false }
    },
    updatedAt: serverTimestamp(),
    updatedBy: "admin-1"
  };
  await assertSucceeds(setDoc(doc(adminDb, "settings", "catalog"), catalog));

  const staffDb = testEnv.authenticatedContext("staff-1").firestore();
  await assertFails(setDoc(doc(staffDb, "settings", "catalog"), catalog));

  const studentDb = testEnv.authenticatedContext("student-1", {
    email_verified: true
  }).firestore();
  await assertFails(setDoc(doc(studentDb, "settings", "catalog"), catalog));
});

test("el personal puede cargar stock y el alumno no puede modificarlo por separado", async () => {
  const staffDb = testEnv.authenticatedContext("staff-1").firestore();
  await assertSucceeds(setDoc(doc(staffDb, "dailyAvailability", "20261202"), {
    dateNumber: 20261202,
    bizcochosRemaining: 35,
    facturasRemaining: 20,
    updatedAt: serverTimestamp(),
    updatedBy: "staff-1",
    lastOrderId: "",
    lastAction: "configured"
  }));

  const studentDb = testEnv.authenticatedContext("student-1", {
    email_verified: true
  }).firestore();
  await assertFails(updateDoc(doc(studentDb, "dailyAvailability", "20261201"), {
    bizcochosRemaining: 6,
    facturasRemaining: 10,
    updatedAt: serverTimestamp(),
    updatedBy: "student-1",
    lastOrderId: "order-1",
    lastAction: "reserved"
  }));
});

test("cancelar un pedido y devolver stock requiere una transacción coordinada", async () => {
  const staffDb = testEnv.authenticatedContext("staff-1").firestore();
  const orderRef = doc(staffDb, "orders", "order-1");
  const stockRef = doc(staffDb, "dailyAvailability", "20261201");

  await assertFails(updateDoc(orderRef, {
    status: "cancelled",
    updatedAt: serverTimestamp()
  }));

  await assertSucceeds(runTransaction(staffDb, async (transaction) => {
    const orderSnapshot = await transaction.get(orderRef);
    const stockSnapshot = await transaction.get(stockRef);
    const order = orderSnapshot.data();
    const stock = stockSnapshot.data();

    transaction.update(orderRef, {
      status: "cancelled",
      updatedAt: serverTimestamp()
    });
    transaction.update(stockRef, {
      bizcochosRemaining: stock.bizcochosRemaining + order.items.bizcochos,
      facturasRemaining: stock.facturasRemaining + order.items.facturas,
      updatedAt: serverTimestamp(),
      updatedBy: "staff-1",
      lastOrderId: "order-1",
      lastAction: "released"
    });
  }));

  const stockSnapshot = await getDoc(stockRef);
  assert.equal(stockSnapshot.data().bizcochosRemaining, 10);
  assert.equal(stockSnapshot.data().facturasRemaining, 10);
});

test("solo administración puede crear excepciones válidas del calendario escolar", async () => {
  const adminDb = testEnv.authenticatedContext("admin-1").firestore();
  const schoolDay = {
    dateNumber: 20261202,
    open: false,
    label: "Feriado de prueba",
    updatedAt: serverTimestamp()
  };
  await assertSucceeds(setDoc(doc(adminDb, "schoolDays", "20261202"), schoolDay));

  const staffDb = testEnv.authenticatedContext("staff-1").firestore();
  await assertFails(setDoc(doc(staffDb, "schoolDays", "20261203"), {
    ...schoolDay,
    dateNumber: 20261203
  }));

  const studentDb = testEnv.authenticatedContext("student-1", {
    email_verified: true
  }).firestore();
  await assertFails(setDoc(doc(studentDb, "schoolDays", "20261204"), {
    ...schoolDay,
    dateNumber: 20261204
  }));
});

test("solo administración puede eliminar un cierre del calendario escolar", async () => {
  const adminDb = testEnv.authenticatedContext("admin-1").firestore();
  await assertSucceeds(deleteDoc(doc(adminDb, "schoolDays", "20261201")));

  const staffDb = testEnv.authenticatedContext("staff-1").firestore();
  await assertFails(deleteDoc(doc(staffDb, "schoolDays", "20261201")));
});
