import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [rules, studentOrders, staff, studentPage, staffPage, app, sw, manifest] = await Promise.all([
  readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
  readFile(new URL("../public/js/student-orders.js", import.meta.url), "utf8"),
  readFile(new URL("../public/js/staff.js", import.meta.url), "utf8"),
  readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  readFile(new URL("../public/personal.html", import.meta.url), "utf8"),
  readFile(new URL("../public/js/app.js", import.meta.url), "utf8"),
  readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8")
]);

test("la instalación web tiene botón, manifiesto, iconos y registro del service worker", () => {
  for (const page of [studentPage, staffPage]) {
    assert.match(page, /id="install-app"/);
    assert.match(page, /rel="manifest"/);
    assert.match(page, /apple-mobile-web-app-capable/);
  }
  assert.match(app, /beforeinstallprompt/);
  assert.match(app, /Añadir a pantalla de inicio/);
  assert.match(app, /serviceWorker\.register/);
  const data = JSON.parse(manifest);
  assert.equal(data.display, "standalone");
  assert.ok(data.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(data.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));
  assert.match(sw, /buffet411-shell-v13/);
});

test("el stock se sincroniza con el catálogo y se comprueba también al confirmar", () => {
  assert.match(studentOrders, /collection\(db, "catalogSettings"\)/);
  assert.match(studentOrders, /b411:catalog-updated/);
  assert.match(studentOrders, /Los bizcochos no están disponibles/);
  assert.match(studentOrders, /Las facturas no están disponibles/);
  assert.match(app, /productAvailability/);
  assert.match(rules, /match \/catalogSettings\//);
  assert.match(rules, /catalogSettings\/bizcochos/);
  assert.match(rules, /catalogSettings\/facturas/);
});

test("el personal puede gestionar stock y administración puede cerrar jornadas", () => {
  assert.match(staff, /startStaffSettings/);
  assert.match(staff, /setDoc\(doc\(db, "catalogSettings"/);
  assert.match(staff, /schoolDays/);
  assert.match(staff, /Solo administración puede modificar el calendario escolar/);
  assert.match(rules, /match \/schoolDays\//);
  assert.match(rules, /request.resource.data.open is bool/);
});

test("el panel resume pagos pendientes, por verificar y confirmados", () => {
  assert.match(staffPage, /staff-payment-unpaid/);
  assert.match(staffPage, /staff-payment-review/);
  assert.match(staffPage, /staff-payment-paid/);
  assert.match(staff, /paymentStatus === "pending_review"/);
  assert.match(staff, /paymentStatus === "paid"/);
});
