if (location.hostname !== "buffet411-f80af.web.app") {
  // Do not authenticate, read, or write Firestore from the GitHub Pages preview.
  const checkout = document.querySelector("#checkout-open");
  const feedback = document.querySelector("[data-cart-feedback]");
  const orders = document.querySelector("#student-orders-list");
  if (checkout) {
    checkout.disabled = true;
    checkout.textContent = "Pedidos disponibles en la versión operativa";
  }
  if (feedback) feedback.textContent = "Vista de demostración: el carrito es local y no se guardan pedidos.";
  if (orders) orders.textContent = "El historial estará disponible en la versión operativa.";
} else {
  const { auth, db } = await import("./firebase.js");
  const { onIdTokenChanged } = await import("https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js");
  const {
    collection,
    doc,
    getDoc,
    onSnapshot,
    query,
    runTransaction,
    serverTimestamp,
    where
  } = await import("https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js");
  const {
    countCartUnits,
    formatARS,
    getArgentinaMidnightTimestamp,
    getDateNumber,
    getNextSchoolDate,
    isOrderWindowOpen
  } = await import("./domain.js");

const $ = (selector) => document.querySelector(selector);
const checkoutButton = $("#checkout-open");
const checkoutDialog = $("#student-checkout-dialog");
const checkoutForm = $("#student-checkout-form");
const checkoutFeedback = $("#checkout-feedback");
const ordersList = $("#student-orders-list");

let studentProfile = null;
let currentCart = { bizcochos: 0, facturas: 0 };
let currentCartTotal = 0;
let dailyQuantity = 0;
let serviceDateKey = "";
let serviceDateNumber = 0;
let stopDailyTotal = null;
let stopOrders = null;
let stopSchoolDays = null;
let stopCatalog = null;
let stopAvailability = null;
let schoolDayEntries = [];
let catalogProducts = {
  bizcochos: { price: 500, active: true },
  facturas: { price: 1000, active: true }
};
let catalogConfigured = false;
let availabilityConfigured = false;
let availabilityRemaining = { bizcochos: 0, facturas: 0 };
let authLoadToken = 0;
let placingOrder = false;

const statusNames = {
  pending: "Pendiente",
  accepted: "Aceptado",
  preparing: "En preparación",
  ready: "Listo para retirar",
  delivered: "Entregado",
  cancelled: "Cancelado"
};

const paymentNames = {
  unpaid: "Pago pendiente",
  pending_review: "Pago por verificar",
  paid: "Pago confirmado"
};

function setCheckoutFeedback(text, kind = "") {
  checkoutFeedback.textContent = text;
  if (kind) checkoutFeedback.dataset.kind = kind;
  else delete checkoutFeedback.dataset.kind;
}

function updateDailyCounter() {
  const target = $("#student-daily-usage");
  if (target) {
    target.textContent = "Ya encargaste " + dailyQuantity + " de 5 unidades para la próxima jornada.";
  }
  document.dispatchEvent(new CustomEvent("b411:daily-total", {
    detail: { quantity: dailyQuantity, remaining: Math.max(0, 5 - dailyQuantity) }
  }));
}

function calendarDateKey(value) {
  const digits = String(value || "").replace(/\D/g, "").padStart(8, "0");
  if (digits.length !== 8) return "";
  return digits.slice(0, 4) + "-" + digits.slice(4, 6) + "-" + digits.slice(6, 8);
}

function prepareServiceDate(entries = schoolDayEntries) {
  const openDates = entries.filter((entry) => entry.open).map((entry) => calendarDateKey(entry.dateNumber));
  const closedDates = entries.filter((entry) => !entry.open).map((entry) => calendarDateKey(entry.dateNumber));
  serviceDateKey = getNextSchoolDate(new Date(), { openDates, closedDates });
  serviceDateNumber = getDateNumber(serviceDateKey);
  const at = getArgentinaMidnightTimestamp(serviceDateKey);
  $("#checkout-service-date").textContent = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Cordoba"
  }).format(at);
}

function stopStudentListeners() {
  if (stopDailyTotal) stopDailyTotal();
  if (stopOrders) stopOrders();
  if (stopSchoolDays) stopSchoolDays();
  if (stopCatalog) stopCatalog();
  if (stopAvailability) stopAvailability();
  stopDailyTotal = null;
  stopOrders = null;
  stopSchoolDays = null;
  stopCatalog = null;
  stopAvailability = null;
  schoolDayEntries = [];
  catalogConfigured = false;
  availabilityConfigured = false;
  availabilityRemaining = { bizcochos: 0, facturas: 0 };
  serviceDateKey = "";
  serviceDateNumber = 0;
  dailyQuantity = 0;
  updateDailyCounter();
}

function renderOrders(documents) {
  ordersList.replaceChildren();
  if (!documents.length) {
    const empty = document.createElement("p");
    empty.className = "cart-empty";
    empty.textContent = "Todavía no tenés pedidos. Tus encargos confirmados aparecerán acá.";
    ordersList.appendChild(empty);
    return;
  }

  documents.sort((a, b) => {
    const left = a.createdAt?.toMillis?.() || 0;
    const right = b.createdAt?.toMillis?.() || 0;
    return right - left;
  });

  for (const order of documents) {
    const card = document.createElement("article");
    card.className = "student-order-card";

    const top = document.createElement("div");
    top.className = "student-order-top";
    const id = document.createElement("strong");
    id.textContent = "Pedido #" + order.id.slice(0, 8).toUpperCase();
    const status = document.createElement("span");
    status.className = "student-order-status status-" + order.status;
    status.textContent = statusNames[order.status] || "En revisión";
    top.append(id, status);

    const serviceDate = document.createElement("p");
    serviceDate.className = "student-order-meta";
    const date = order.serviceDateAt?.toDate
      ? order.serviceDateAt.toDate()
      : new Date(order.serviceDateAt);
    serviceDate.textContent = new Intl.DateTimeFormat("es-AR", {
      weekday: "long", day: "numeric", month: "long",
      timeZone: "America/Argentina/Cordoba"
    }).format(date);

    const details = document.createElement("p");
    details.className = "student-order-meta";
    const items = [];
    if (order.items?.bizcochos) items.push(order.items.bizcochos + " bizcocho(s)");
    if (order.items?.facturas) items.push(order.items.facturas + " factura(s)");
    const slot = order.pickupSlot === "primer-recreo" ? "08:50–09:00" : "10:20–10:30";
    details.textContent = items.join(" · ") + " · Retiro: " + slot;

    const bottom = document.createElement("div");
    bottom.className = "student-order-bottom";
    const payment = document.createElement("span");
    payment.textContent = (order.paymentMethod === "cash" ? "Efectivo" : "Mercado Pago")
      + " · " + (paymentNames[order.paymentStatus] || "Pago pendiente");
    const total = document.createElement("strong");
    total.textContent = formatARS(order.total);
    bottom.append(payment, total);

    card.append(top, serviceDate, details, bottom);
    ordersList.appendChild(card);
  }
}

function listenForDailyTotal(user, token) {
  const totalRef = doc(db, "dailyOrderTotals", user.uid + "_" + serviceDateNumber);
  stopDailyTotal = onSnapshot(totalRef, (snapshot) => {
    if (token !== authLoadToken) return;
    dailyQuantity = snapshot.exists() ? Number(snapshot.data().quantity || 0) : 0;
    updateDailyCounter();
  }, (error) => {
    console.error("No se pudo leer el límite diario:", error);
    setCheckoutFeedback("No pudimos consultar tu límite diario. El servidor lo comprobará al confirmar.", "error");
  });
}

function publishCatalogState() {
  document.dispatchEvent(new CustomEvent("b411:catalog-config", {
    detail: { products: catalogProducts, configured: catalogConfigured }
  }));
}

function publishAvailabilityState() {
  document.dispatchEvent(new CustomEvent("b411:stock-update", {
    detail: { remaining: availabilityRemaining, configured: availabilityConfigured }
  }));
}

function currentCartFitsAvailability(cart = currentCart) {
  if (!catalogConfigured || !availabilityConfigured) return false;
  return ["bizcochos", "facturas"].every((productId) => {
    const quantity = Number(cart[productId] || 0);
    return quantity === 0 || (
      catalogProducts[productId]?.active === true &&
      Number.isSafeInteger(quantity) && quantity <= availabilityRemaining[productId]
    );
  });
}

function listenForDailyAvailability(token) {
  if (stopAvailability) stopAvailability();
  const availabilityRef = doc(db, "dailyAvailability", String(serviceDateNumber));
  stopAvailability = onSnapshot(availabilityRef, (snapshot) => {
    if (token !== authLoadToken) return;
    availabilityConfigured = snapshot.exists();
    if (availabilityConfigured) {
      const data = snapshot.data();
      availabilityRemaining = {
        bizcochos: Number(data.bizcochosRemaining || 0),
        facturas: Number(data.facturasRemaining || 0)
      };
    } else {
      availabilityRemaining = { bizcochos: 0, facturas: 0 };
    }
    publishAvailabilityState();
    if (checkoutButton) checkoutButton.disabled =
      countCartUnits(currentCart) < 1 || !currentCartFitsAvailability();
  }, (error) => {
    console.error("No se pudo consultar el stock de la jornada:", error);
    availabilityConfigured = false;
    availabilityRemaining = { bizcochos: 0, facturas: 0 };
    publishAvailabilityState();
    setCheckoutFeedback("No pudimos consultar el stock. Intentá nuevamente más tarde.", "error");
  });
}

async function connectStudent(user, token) {
  if (!user.emailVerified) return;
  const profileSnapshot = await getDoc(doc(db, "users", user.uid));
  if (token !== authLoadToken || !auth.currentUser) return;
  if (!profileSnapshot.exists()) return;
  const profile = profileSnapshot.data();
  if (profile.role !== "student" || profile.active !== true) return;

  studentProfile = profile;

  stopCatalog = onSnapshot(doc(db, "settings", "catalog"), (snapshot) => {
    if (token !== authLoadToken) return;
    catalogConfigured = snapshot.exists();
    if (catalogConfigured) {
      const products = snapshot.data().products || {};
      catalogProducts = {
        bizcochos: {
          price: Number(products.bizcochos?.price || 0),
          active: products.bizcochos?.active === true
        },
        facturas: {
          price: Number(products.facturas?.price || 0),
          active: products.facturas?.active === true
        }
      };
    } else {
      catalogProducts = {
        bizcochos: { price: 500, active: true },
        facturas: { price: 1000, active: true }
      };
    }
    publishCatalogState();
    if (checkoutButton) checkoutButton.disabled =
      countCartUnits(currentCart) < 1 || !currentCartFitsAvailability();
  }, (error) => {
    console.error("No se pudo consultar el catálogo:", error);
    catalogConfigured = false;
    publishCatalogState();
    setCheckoutFeedback("No pudimos consultar los precios y disponibilidad del catálogo.", "error");
  });

  stopOrders = onSnapshot(
    query(collection(db, "orders"), where("uid", "==", user.uid)),
    (snapshot) => {
      if (token !== authLoadToken) return;
      renderOrders(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    },
    (error) => {
      console.error("No se pudieron cargar tus pedidos:", error);
      ordersList.textContent = "No pudimos cargar tus pedidos. Actualizá la página para intentar nuevamente.";
    }
  );

  stopSchoolDays = onSnapshot(collection(db, "schoolDays"), (snapshot) => {
    if (token !== authLoadToken) return;
    const previousServiceDate = serviceDateNumber;
    schoolDayEntries = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
      dateNumber: Number(item.data().dateNumber || item.id)
    }));
    try {
      prepareServiceDate(schoolDayEntries);
      if (previousServiceDate !== serviceDateNumber || !stopDailyTotal) {
        if (stopDailyTotal) stopDailyTotal();
        listenForDailyTotal(user, token);
        listenForDailyAvailability(token);
      }
    } catch (error) {
      console.error("No se pudo calcular la próxima jornada:", error);
      setCheckoutFeedback("No pudimos calcular la próxima jornada. Consultá al personal del buffet.", "error");
    }
  }, (error) => {
    console.error("No se pudo consultar el calendario escolar:", error);
    if (!serviceDateNumber) {
      try {
        prepareServiceDate([]);
        listenForDailyTotal(user, token);
        listenForDailyAvailability(token);
      } catch (dateError) {
        console.error("No se pudo calcular la fecha sin calendario:", dateError);
      }
    }
    setCheckoutFeedback("No pudimos actualizar el calendario escolar. Se mantiene la fecha ya cargada.", "error");
  });
}
document.addEventListener("b411:cart-updated", (event) => {
  currentCart = { ...event.detail.cart };
  currentCartTotal = Number(event.detail.total || 0);
  if (checkoutButton) checkoutButton.disabled =
    countCartUnits(currentCart) < 1 || !currentCartFitsAvailability();
});

document.addEventListener("b411:daily-total", (event) => {
  dailyQuantity = Number(event.detail.quantity || 0);
});

checkoutButton.addEventListener("click", () => {
  if (!auth.currentUser || !studentProfile) {
    setCheckoutFeedback("Iniciá sesión como alumno para confirmar un pedido.", "error");
    return;
  }
  if (!isOrderWindowOpen()) {
    setCheckoutFeedback("Los pedidos se reciben de 13:00 a 17:00, hora de Argentina.", "error");
    return;
  }
  if (countCartUnits(currentCart) < 1) return;
  if (!catalogConfigured) {
    setCheckoutFeedback("El catálogo todavía no fue configurado por administración.", "error");
    return;
  }
  if (!availabilityConfigured) {
    setCheckoutFeedback("El stock de la próxima jornada todavía no fue cargado por el personal.", "error");
    return;
  }
  if (!currentCartFitsAvailability()) {
    setCheckoutFeedback("Tu carrito supera el stock disponible o incluye un producto no habilitado.", "error");
    return;
  }
  prepareServiceDate();
  $("#checkout-total").textContent = formatARS(currentCartTotal);
  setCheckoutFeedback("Revisá el recreo y el medio de pago antes de enviar.");
  checkoutDialog.showModal();
});

$("#checkout-close").addEventListener("click", () => checkoutDialog.close());

checkoutForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (placingOrder) return;
  const user = auth.currentUser;
  if (!user || !user.emailVerified || !studentProfile) {
    setCheckoutFeedback("Tu sesión no está validada. Iniciá sesión nuevamente.", "error");
    return;
  }
  if (!isOrderWindowOpen()) {
    setCheckoutFeedback("El horario para pedir es de 13:00 a 17:00.", "error");
    return;
  }

  let quantity;
  try {
    quantity = countCartUnits(currentCart);
  } catch (error) {
    setCheckoutFeedback("El carrito no es válido.", "error");
    return;
  }
  if (quantity < 1 || quantity > 5) {
    setCheckoutFeedback("El pedido debe tener entre 1 y 5 unidades.", "error");
    return;
  }
  if (dailyQuantity + quantity > 5) {
    setCheckoutFeedback("Ya usaste parte de tu límite diario. Te quedan " + Math.max(0, 5 - dailyQuantity) + " unidad(es).", "error");
    return;
  }

  const pickupSlot = $("#checkout-pickup").value;
  const paymentMethod = $("#checkout-payment").value;
  let confirmedTotal = 0;
  const orderRef = doc(collection(db, "orders"));
  const dailyTotalId = user.uid + "_" + serviceDateNumber;
  const totalRef = doc(db, "dailyOrderTotals", dailyTotalId);
  const submit = $("#checkout-submit");

  placingOrder = true;
  submit.disabled = true;
  setCheckoutFeedback("Guardando tu pedido de forma segura…");
  try {
    await runTransaction(db, async (transaction) => {
      const totalSnapshot = await transaction.get(totalRef);
      const availabilityRef = doc(db, "dailyAvailability", String(serviceDateNumber));
      const catalogRef = doc(db, "settings", "catalog");
      const availabilitySnapshot = await transaction.get(availabilityRef);
      const catalogSnapshot = await transaction.get(catalogRef);
      const oldQuantity = totalSnapshot.exists() ? Number(totalSnapshot.data().quantity || 0) : 0;
      const oldOrderCount = totalSnapshot.exists() ? Number(totalSnapshot.data().orderCount || 0) : 0;
      if (oldQuantity + quantity > 5) {
        throw new RangeError("Límite diario alcanzado. Te quedan " + Math.max(0, 5 - oldQuantity) + " unidad(es).");
      }
      if (!catalogSnapshot.exists()) throw new Error("catalog-not-configured");
      if (!availabilitySnapshot.exists()) throw new Error("stock-not-configured");

      const products = catalogSnapshot.data().products || {};
      const bizcochosProduct = products.bizcochos || {};
      const facturasProduct = products.facturas || {};
      if (currentCart.bizcochos > 0 && bizcochosProduct.active !== true) {
        throw new Error("bizcochos-unavailable");
      }
      if (currentCart.facturas > 0 && facturasProduct.active !== true) {
        throw new Error("facturas-unavailable");
      }
      const stock = availabilitySnapshot.data();
      const bizcochosRemaining = Number(stock.bizcochosRemaining || 0);
      const facturasRemaining = Number(stock.facturasRemaining || 0);
      if (currentCart.bizcochos > bizcochosRemaining || currentCart.facturas > facturasRemaining) {
        throw new Error("stock-insufficient");
      }
      confirmedTotal = Number(currentCart.bizcochos || 0) * Number(bizcochosProduct.price)
        + Number(currentCart.facturas || 0) * Number(facturasProduct.price);
      if (!Number.isSafeInteger(confirmedTotal) || confirmedTotal < 1) {
        throw new Error("catalog-invalid");
      }

      const orderData = {
        uid: user.uid,
        displayName: studentProfile.displayName,
        course: studentProfile.course,
        division: studentProfile.division,
        serviceDateAt: getArgentinaMidnightTimestamp(serviceDateKey),
        serviceDateNumber,
        dailyTotalId,
        items: { bizcochos: Number(currentCart.bizcochos || 0), facturas: Number(currentCart.facturas || 0) },
        quantity,
        total: confirmedTotal,
        pickupSlot,
        paymentMethod,
        paymentStatus: paymentMethod === "cash" ? "unpaid" : "pending_review",
        status: "pending",
        createdAt: serverTimestamp()
      };

      transaction.set(orderRef, orderData);
      transaction.set(totalRef, {
        uid: user.uid,
        serviceDateNumber,
        quantity: oldQuantity + quantity,
        orderCount: oldOrderCount + 1,
        latestOrderId: orderRef.id,
        updatedAt: serverTimestamp()
      });
      transaction.update(availabilityRef, {
        bizcochosRemaining: bizcochosRemaining - Number(currentCart.bizcochos || 0),
        facturasRemaining: facturasRemaining - Number(currentCart.facturas || 0),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        lastOrderId: orderRef.id,
        lastAction: "reserved"
      });
    });

    checkoutDialog.close();
    document.dispatchEvent(new CustomEvent("b411:clear-cart"));
    setCheckoutFeedback("¡Pedido guardado por " + formatARS(confirmedTotal) + "!");
    // El historial se actualiza automáticamente mediante el listener de Firestore.
    window.setTimeout(() => {
      const target = $("#mis-pedidos");
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  } catch (error) {
    console.error("No se pudo guardar el pedido:", error);
    const message = error.message === "catalog-not-configured"
      ? "El catálogo todavía no fue configurado por administración."
      : error.message === "stock-not-configured"
        ? "El personal todavía no cargó el stock para esta jornada."
        : error.message === "stock-insufficient"
          ? "El stock cambió mientras preparabas el pedido. Actualizá el carrito con las unidades disponibles."
          : error.message === "bizcochos-unavailable" || error.message === "facturas-unavailable"
            ? "Uno de los productos dejó de estar disponible. Actualizá el catálogo."
            : error.message === "catalog-invalid"
              ? "El catálogo tiene precios inválidos. Avisá al personal."
              : error.code === "permission-denied"
                ? "Firebase rechazó el pedido. Revisá la fecha, el stock y los permisos."
                : error.code === "failed-precondition"
                  ? "No se pudo guardar todavía. Actualizá la página e intentá nuevamente."
                  : error.message || "No se pudo guardar el pedido. Intentá otra vez.";
    setCheckoutFeedback(message, "error");
  } finally {
    placingOrder = false;
    submit.disabled = false;
  }
});

onIdTokenChanged(auth, (user) => {
  const token = ++authLoadToken;
  stopStudentListeners();
  studentProfile = null;
  if (!user) {
    document.dispatchEvent(new CustomEvent("b411:clear-cart"));
    return;
  }
  connectStudent(user, token).catch((error) => {
    console.error("No se pudo preparar el sistema de pedidos:", error);
  });
});

}
