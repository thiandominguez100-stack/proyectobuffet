import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [staff, page, styles] = await Promise.all([
  readFile(new URL("../public/js/staff.js", import.meta.url), "utf8"),
  readFile(new URL("../public/personal.html", import.meta.url), "utf8"),
  readFile(new URL("../public/css/app.css", import.meta.url), "utf8")
]);

test("el panel permite buscar pedidos por alumno, curso, división e identificador", () => {
  assert.match(page, /id="staff-orders-search"/);
  assert.match(staff, /order\.displayName[\s\S]*order\.course[\s\S]*order\.division[\s\S]*order\.id/);
  assert.match(staff, /searchableText\.includes\(search\)/);
});

test("el panel permite filtrar por recreo y estado", () => {
  assert.match(page, /id="staff-orders-slot-filter"/);
  assert.match(page, /id="staff-orders-status-filter"/);
  assert.match(staff, /order\.pickupSlot !== slot/);
  assert.match(staff, /order\.status !== status/);
});

test("el panel pagina 25 pedidos por vez y conserva los controles accesibles", () => {
  assert.match(staff, /ORDERS_PAGE_SIZE = 25/);
  assert.match(staff, /slice\(start, start \+ ORDERS_PAGE_SIZE\)/);
  assert.match(page, /id="staff-orders-page-info"/);
  assert.match(page, /id="staff-orders-page-prev"/);
  assert.match(page, /id="staff-orders-page-next"/);
  assert.match(styles, /\.staff-orders-pagination/);
});

test("los totales de producción se calculan con todos los pedidos activos, no solo la página visible", () => {
  assert.match(staff, /const activeOrders = orders\.filter\(\(order\) => order\.status !== "cancelled"\)/);
  assert.match(staff, /for \(const order of activeOrders\)/);
  assert.match(staff, /const filteredOrders = getFilteredStaffOrders\(sortedOrders\)/);
});


test("el panel calcula saldos por efectivo, Mercado Pago y pagos confirmados", () => {
  assert.match(page, /id="staff-payment-cash-pending"/);
  assert.match(page, /id="staff-payment-mp-pending"/);
  assert.match(page, /id="staff-payment-paid"/);
  assert.match(staff, /paymentBuckets/);
  assert.match(staff, /order.paymentStatus !== payment/);
});


test("el calendario permite cargar excepciones y distingue controles administrativos", () => {
  assert.match(page, /<form id="staff-calendar-form"[^>]*hidden>/);
  assert.match(page, /id="staff-calendar-date"/);
  assert.match(page, /id="staff-calendar-open"/);
  assert.match(staff, /currentAuthorizedRole !== "admin"/);
  assert.match(staff, /setDoc\(doc\(db, "schoolDays"/);
  assert.match(staff, /deleteDoc\(doc\(db, "schoolDays"/);
});


test("el personal puede cargar stock y administración puede cambiar precios y activar productos", () => {
  assert.match(page, /id="staff-catalog-form" hidden/);
  assert.match(page, /id="staff-price-bizcochos"/);
  assert.match(page, /id="staff-price-facturas"/);
  assert.match(page, /id="staff-stock-form"/);
  assert.match(page, /id="staff-stock-bizcochos"/);
  assert.match(staff, /startCatalogSettingsListener/);
  assert.match(staff, /listenForDailyAvailability/);
  assert.match(staff, /currentAuthorizedRole !== "admin"/);
});

test("cancelar un pedido usa una transacción que devuelve las unidades al stock", () => {
  assert.match(staff, /action\.key === "cancelled"/);
  assert.match(staff, /transaction\.update\(availabilityRef/);
  assert.match(staff, /lastAction: "released"/);
});
