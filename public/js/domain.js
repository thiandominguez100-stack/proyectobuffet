export const TIME_ZONE = "America/Argentina/Cordoba";
export const DAILY_LIMIT = 5;

export const PRODUCTS = Object.freeze({
  bizcochos: Object.freeze({ id: "bizcochos", name: "Bizcochos", price: 500 }),
  facturas: Object.freeze({ id: "facturas", name: "Facturas", price: 1000 })
});

export const PICKUP_SLOTS = Object.freeze([
  Object.freeze({ id: "primer-recreo", label: "08:50–09:00" }),
  Object.freeze({ id: "ultimo-recreo", label: "10:20–10:30" })
]);

export function createEmptyCart() {
  return { bizcochos: 0, facturas: 0 };
}

export function countCartUnits(cart) {
  return Object.values(PRODUCTS).reduce((sum, product) => {
    const quantity = Number(cart?.[product.id] ?? 0);
    return sum + (Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 0);
  }, 0);
}

export function addProductToCart(cart, productId, amount = 1) {
  if (!Object.hasOwn(PRODUCTS, productId)) {
    throw new TypeError("Producto no válido.");
  }
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new TypeError("La cantidad debe ser un entero positivo.");
  }
  const next = { ...createEmptyCart(), ...cart };
  const nextQuantity = Number(next[productId] || 0) + amount;
  if (!Number.isSafeInteger(nextQuantity) || nextQuantity < 0) {
    throw new TypeError("Cantidad no válida.");
  }
  const nextCart = { ...next, [productId]: nextQuantity };
  if (countCartUnits(nextCart) > DAILY_LIMIT) {
    throw new RangeError("El máximo es de 5 productos en total por alumno y jornada.");
  }
  return nextCart;
}

export function removeProductFromCart(cart, productId, amount = 1) {
  if (!Object.hasOwn(PRODUCTS, productId)) {
    throw new TypeError("Producto no válido.");
  }
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new TypeError("La cantidad debe ser un entero positivo.");
  }
  const next = { ...createEmptyCart(), ...cart };
  return {
    ...next,
    [productId]: Math.max(0, Number(next[productId] || 0) - amount)
  };
}

export function calculateCartTotal(cart) {
  return Object.values(PRODUCTS).reduce((sum, product) => {
    const quantity = Number(cart?.[product.id] ?? 0);
    if (!Number.isSafeInteger(quantity) || quantity < 0) {
      throw new TypeError("El carrito contiene una cantidad no válida.");
    }
    return sum + product.price * quantity;
  }, 0);
}

export function formatARS(amount) {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new TypeError("El importe no es válido.");
  }
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0
  }).format(amount);
}

export function getArgentinaDateParts(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError("Fecha no válida.");
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

export function getArgentinaDateKey(date = new Date()) {
  const { year, month, day } = getArgentinaDateParts(date);
  return [year, String(month).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
}

export function getArgentinaMinutes(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError("Fecha no válida.");
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
  return values.hour * 60 + values.minute;
}

export function isOrderWindowOpen(date = new Date()) {
  const minutes = getArgentinaMinutes(date);
  const { year, month, day } = getArgentinaDateParts(date);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  // Se permiten pedidos de domingo a viernes; sábado queda cerrado.
  return weekday !== 6 && minutes >= 13 * 60 && minutes < 17 * 60;
}

export function getNextSchoolDate(date = new Date(), options = {}) {
  const { openDates = [], closedDates = [], maxDays = 370 } = options;
  if (!Number.isSafeInteger(maxDays) || maxDays < 1 || maxDays > 370) {
    throw new TypeError("El rango del calendario debe estar entre 1 y 370 días.");
  }
  const current = getArgentinaDateParts(date);
  const candidate = new Date(Date.UTC(current.year, current.month - 1, current.day));
  const open = new Set(openDates);
  const closed = new Set(closedDates);

  for (let offset = 1; offset <= maxDays; offset += 1) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
    const key = [
      candidate.getUTCFullYear(),
      String(candidate.getUTCMonth() + 1).padStart(2, "0"),
      String(candidate.getUTCDate()).padStart(2, "0")
    ].join("-");
    if (closed.has(key)) continue;
    const dayOfWeek = candidate.getUTCDay();
    if (open.has(key) || (dayOfWeek !== 0 && dayOfWeek !== 6)) return key;
  }
  throw new Error("No se encontró una próxima jornada habilitada en el calendario.");
}

export function makeOrderSummary(cart, pickupSlot, paymentMethod) {
  const quantity = countCartUnits(cart);
  if (quantity < 1) throw new TypeError("Agregá al menos un producto.");
  if (quantity > DAILY_LIMIT) throw new RangeError("El límite diario es de 5 productos.");
  if (!PICKUP_SLOTS.some((slot) => slot.id === pickupSlot)) {
    throw new TypeError("Elegí un horario de retiro válido.");
  }
  if (!["cash", "mercadopago"].includes(paymentMethod)) {
    throw new TypeError("Elegí un medio de pago válido.");
  }
  return {
    items: { ...createEmptyCart(), ...cart },
    quantity,
    total: calculateCartTotal(cart),
    pickupSlot,
    paymentMethod
  };
}


export function getDateNumber(dateKey) {
  if (typeof dateKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new TypeError("La fecha del pedido no es válida.");
  }
  return Number(dateKey.replaceAll("-", ""));
}

export function getArgentinaMidnightTimestamp(dateKey) {
  getDateNumber(dateKey);
  // Medianoche de Argentina (UTC-3), representada como instante UTC.
  return new Date(dateKey + "T00:00:00-03:00");
}
