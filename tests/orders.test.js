import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  getArgentinaMidnightTimestamp,
  getDateNumber,
  getNextSchoolDate,
  isOrderWindowOpen
} from "../public/js/domain.js";

const rules = await readFile(new URL("../firestore.rules", import.meta.url), "utf8");
const orderClient = await readFile(new URL("../public/js/student-orders.js", import.meta.url), "utf8");
const studentHtml = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const staffHtml = await readFile(new URL("../public/personal.html", import.meta.url), "utf8");

test("la fecha del pedido se convierte a la clave numérica única YYYYMMDD", () => {
  assert.equal(getDateNumber("2026-11-09"), 20261109);
  assert.throws(() => getDateNumber("09-11-2026"), TypeError);
});

test("la fecha de servicio se representa como medianoche argentina", () => {
  assert.equal(getArgentinaMidnightTimestamp("2026-11-09").toISOString(), "2026-11-09T03:00:00.000Z");
});

test("el siguiente día hábil salta el fin de semana", () => {
  assert.equal(getNextSchoolDate(new Date("2026-11-06T15:00:00.000Z")), "2026-11-09");
});

test("la ventana local de pedidos abre a las 13:00 y cierra antes de las 17:00", () => {
  assert.equal(isOrderWindowOpen(new Date("2026-11-06T16:00:00.000Z")), true);
  assert.equal(isOrderWindowOpen(new Date("2026-11-06T19:59:00.000Z")), true);
  assert.equal(isOrderWindowOpen(new Date("2026-11-06T20:00:00.000Z")), false);
});

test("los pedidos y el contador diario se guardan en la misma transacción", () => {
  assert.match(orderClient, /runTransaction\(db/);
  assert.match(orderClient, /transaction\.set\(orderRef/);
  assert.match(orderClient, /transaction\.set\(totalRef/);
  assert.match(rules, /getAfter\(totalPath\)/);
  assert.match(rules, /getAfter\(orderPath\)/);
});

test("las reglas imponen un máximo combinado de cinco unidades por fecha y alumno", () => {
  assert.match(rules, /request\.resource\.data\.quantity <= 5/);
  assert.match(rules, /afterTotal\.quantity <= 5/);
  assert.ok(rules.includes("afterTotal.quantity == oldQuantity + data.quantity"));
  assert.match(rules, /dailyTotalId == request\.auth\.uid \+ '_' \+ string\(request\.resource\.data\.serviceDateNumber\)/);
});

test("los pedidos requieren cuenta de alumno activa y correo verificado", () => {
  assert.match(rules, /request\.auth\.token\.email_verified == true/);
  assert.match(rules, /get\(\/databases\/\$\(database\)\/documents\/users\/\$\(uid\)\)\.data\.role == 'student'/);
  assert.match(rules, /get\(\/databases\/\$\(database\)\/documents\/users\/\$\(uid\)\)\.data\.active == true/);
});

test("el panel del personal recibe pedidos y permite cambiar su estado", () => {
  assert.match(staffHtml, /id="staff-orders-list"/);
  assert.match(staffHtml, /id="staff-orders-count"/);
});

test("el alumno puede confirmar el recreo y el método de pago", () => {
  assert.match(studentHtml, /id="checkout-pickup"/);
  assert.match(studentHtml, /id="checkout-payment"/);
  assert.match(studentHtml, /id="student-orders-list"/);
});


test("GitHub Pages no acepta pedidos ni consulta Firestore", async () => {
  const preview = orderClient.slice(0, orderClient.indexOf("} else {"));
  assert.match(preview, /location\.hostname\.endsWith\("\.github\.io"\)/);
  assert.match(preview, /checkout\.disabled = true/);
  assert.doesNotMatch(preview, /runTransaction|onSnapshot|firebase\.js/);
});


test("el carrito local nunca habilita checkout desde GitHub Pages", async () => {
  const app = await readFile(new URL("../public/js/app.js", import.meta.url), "utf8");
  assert.match(app, /previewOnly = window\.location\.hostname\.endsWith\("\.github\.io"\)/);
  assert.match(app, /checkoutButton\.disabled = previewOnly \|\| count < 1/);
});


test("el domingo puede crear pedidos para el lunes y el sábado queda excluido", () => {
  assert.equal(getNextSchoolDate(new Date("2026-11-08T16:00:00.000Z")), "2026-11-09");
  assert.equal(isOrderWindowOpen(new Date("2026-11-08T16:00:00.000Z")), true);
  assert.equal(isOrderWindowOpen(new Date("2026-11-07T16:00:00.000Z")), false);
  assert.match(rules, /request\.time\.dayOfWeek\(\) == 7/);
  assert.match(rules, /request\.time\.dayOfWeek\(\) < 6 \|\| request\.time\.dayOfWeek\(\) == 7/);
  assert.match(rules, /dateAt\.date\(\) == request\.time\.date\(\) \+ duration\.value\(1, 'd'\)/);
});
