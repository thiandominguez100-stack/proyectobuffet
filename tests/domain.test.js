import test from "node:test";
import assert from "node:assert/strict";
import {
  DAILY_LIMIT,
  addProductToCart,
  calculateCartTotal,
  countCartUnits,
  createEmptyCart,
  getArgentinaDateKey,
  getArgentinaMinutes,
  getNextSchoolDate,
  isOrderWindowOpen,
  makeOrderSummary,
  removeProductFromCart
} from "../public/js/domain.js";

test("el carrito inicia vacío", () => {
  assert.deepEqual(createEmptyCart(), { bizcochos: 0, facturas: 0 });
  assert.equal(countCartUnits(createEmptyCart()), 0);
});

test("acepta cinco unidades combinadas entre ambos productos", () => {
  const cart = addProductToCart(
    addProductToCart(createEmptyCart(), "bizcochos", 3),
    "facturas",
    2
  );
  assert.equal(countCartUnits(cart), 5);
  assert.equal(calculateCartTotal(cart), 3500);
});

test("rechaza una sexta unidad aunque sea de otro producto", () => {
  const cart = addProductToCart(
    addProductToCart(createEmptyCart(), "bizcochos", 4),
    "facturas",
    1
  );
  assert.throws(() => addProductToCart(cart, "facturas"), {
    name: "RangeError"
  });
});

test("el límite también se aplica cuando se intenta agregar bizcochos después de facturas", () => {
  const cart = addProductToCart(createEmptyCart(), "facturas", DAILY_LIMIT);
  assert.throws(() => addProductToCart(cart, "bizcochos"), RangeError);
});

test("permite quitar unidades y volver a agregar sin superar el límite", () => {
  let cart = addProductToCart(createEmptyCart(), "bizcochos", 5);
  cart = removeProductFromCart(cart, "bizcochos", 2);
  cart = addProductToCart(cart, "facturas", 2);
  assert.equal(countCartUnits(cart), 5);
});

test("rechaza cantidades fraccionarias y productos desconocidos", () => {
  assert.throws(() => addProductToCart(createEmptyCart(), "bizcochos", 1.5), TypeError);
  assert.throws(() => addProductToCart(createEmptyCart(), "alfajor", 1), TypeError);
});

test("el horario de pedidos abre a las 13:00 y cierra al llegar a las 17:00 de Argentina", () => {
  assert.equal(isOrderWindowOpen(new Date("2026-11-06T15:59:00.000Z")), false); // 12:59 AR
  assert.equal(isOrderWindowOpen(new Date("2026-11-06T16:00:00.000Z")), true);  // 13:00 AR
  assert.equal(isOrderWindowOpen(new Date("2026-11-06T19:59:00.000Z")), true);  // 16:59 AR
  assert.equal(isOrderWindowOpen(new Date("2026-11-06T20:00:00.000Z")), false); // 17:00 AR
});

test("obtiene la fecha local argentina", () => {
  assert.equal(getArgentinaDateKey(new Date("2026-11-06T02:00:00.000Z")), "2026-11-05");
  assert.equal(getArgentinaMinutes(new Date("2026-11-06T16:30:00.000Z")), 13 * 60 + 30);
});

test("calcula la próxima jornada de lunes a viernes y respeta cierres y aperturas especiales", () => {
  const friday = new Date("2026-11-06T15:00:00.000Z"); // viernes en Argentina
  assert.equal(getNextSchoolDate(friday), "2026-11-09");
  assert.equal(getNextSchoolDate(friday, { closedDates: ["2026-11-09"] }), "2026-11-10");
  assert.equal(getNextSchoolDate(friday, { openDates: ["2026-11-08"] }), "2026-11-08");
});

test("crea un resumen de pedido validado", () => {
  const cart = addProductToCart(
    addProductToCart(createEmptyCart(), "bizcochos", 2),
    "facturas",
    2
  );
  const summary = makeOrderSummary(cart, "primer-recreo", "cash");
  assert.equal(summary.quantity, 4);
  assert.equal(summary.total, 3000);
  assert.equal(summary.pickupSlot, "primer-recreo");
});
