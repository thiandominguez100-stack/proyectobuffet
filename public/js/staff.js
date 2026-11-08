if (location.hostname !== "buffet411-f80af.web.app") {
  // GitHub Pages shows the layout only; staff credentials and Firestore remain untouched.
  const authPanel = document.querySelector("#staff-auth");
  const dashboard = document.querySelector("#staff-dashboard");
  if (authPanel) authPanel.hidden = true;
  if (dashboard) dashboard.hidden = false;
} else {
  const { auth, db } = await import("./firebase.js");
  const {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
  } = await import("https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js");
  const {
    collection,
    deleteDoc,
    doc,
    getDoc,
    onSnapshot,
    query,
    runTransaction,
    serverTimestamp,
    setDoc,
    writeBatch,
    updateDoc,
    where
  } = await import("https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js");
  const { formatARS, getNextSchoolDate, getDateNumber } = await import("./domain.js");
  const { generateEnrollmentCodes } = await import("./enrollment.js");

const $ = (selector) => document.querySelector(selector);
const form = $("#staff-login-form");
const emailInput = $("#staff-email");
const passwordInput = $("#staff-password");
const submitButton = $("#staff-login-submit");
const message = $("#staff-auth-message");
const dashboard = $("#staff-dashboard");
const authPanel = $("#staff-auth");
const authorizedStep = $("#staff-authorized-step");
const enterPanelButton = $("#staff-enter-panel");
const logoutButton = $("#staff-logout");

let currentAuthorizedUid = null;
let currentAuthorizedRole = null;
let stopOrdersListener = null;
let stopEnrollmentCodesListener = null;
let stopSchoolDaysListener = null;
let stopCatalogListener = null;
let stopAvailabilityListener = null;
let schoolDayEntries = [];
let activeStaffServiceDateNumber = null;
let orderActionsBusy = new Set();
const ORDERS_PAGE_SIZE = 25;
let allOrders = [];
let currentPage = 1;

function showMessage(text, kind = "") {
  message.textContent = text;
  if (kind) message.dataset.kind = kind;
  else delete message.dataset.kind;
}

function stopStaffOrders() {
  if (stopOrdersListener) stopOrdersListener();
  if (stopEnrollmentCodesListener) stopEnrollmentCodesListener();
  if (stopSchoolDaysListener) stopSchoolDaysListener();
  if (stopCatalogListener) stopCatalogListener();
  if (stopAvailabilityListener) stopAvailabilityListener();
  stopOrdersListener = null;
  stopEnrollmentCodesListener = null;
  stopSchoolDaysListener = null;
  stopCatalogListener = null;
  stopAvailabilityListener = null;
  schoolDayEntries = [];
  activeStaffServiceDateNumber = null;
  $("#staff-enrollment-tools").hidden = true;
  $("#staff-calendar-form").hidden = true;
  orderActionsBusy = new Set();
  allOrders = [];
  currentPage = 1;
}

function showLogin(text = "Solo pueden ingresar cuentas con rol de personal o administrador.", kind = "") {
  stopStaffOrders();
  currentAuthorizedUid = null;
  currentAuthorizedRole = null;
  dashboard.hidden = true;
  authPanel.hidden = false;
  form.hidden = false;
  authorizedStep.hidden = true;
  passwordInput.value = "";
  showMessage(text, kind);
}

function showAuthorizedStep(user, role) {
  stopStaffOrders();
  currentAuthorizedUid = user.uid;
  currentAuthorizedRole = role;
  dashboard.hidden = true;
  authPanel.hidden = false;
  form.hidden = true;
  authorizedStep.hidden = false;
  showMessage("Permisos confirmados. Tu cuenta está autorizada para el área de personal.", "success");
}

async function checkStaffRole(user) {
  const roleSnapshot = await getDoc(doc(db, "staffRoles", user.uid));
  if (!roleSnapshot.exists()) return null;
  const role = roleSnapshot.data().role;
  return role === "staff" || role === "admin" ? role : null;
}


function renderEnrollmentCodes(snapshot) {
  const list = $("#staff-enrollment-code-list");
  list.replaceChildren();
  const codes = snapshot.docs.map((item) => item.id).sort();
  if (!codes.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state compact";
    empty.textContent = "No hay códigos disponibles.";
    list.appendChild(empty);
    return;
  }

  for (const code of codes) {
    const row = document.createElement("div");
    row.className = "staff-enrollment-row";
    const value = document.createElement("code");
    value.textContent = code;
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "button button-outline";
    copy.textContent = "Copiar";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(code);
        $("#staff-enrollment-feedback").textContent = "Código copiado. Entregalo solamente al alumno correspondiente.";
      } catch (error) {
        $("#staff-enrollment-feedback").textContent = "No se pudo copiar automáticamente. Seleccioná el código y copialo manualmente.";
      }
    });
    const revoke = document.createElement("button");
    revoke.type = "button";
    revoke.className = "button button-quiet";
    revoke.textContent = "Revocar";
    revoke.addEventListener("click", async () => {
      if (!window.confirm("¿Revocar este código? Después no podrá utilizarse.")) return;
      revoke.disabled = true;
      try {
        await updateDoc(doc(db, "enrollmentCodes", code), {
          status: "revoked",
          revokedAt: serverTimestamp(),
          revokedBy: auth.currentUser.uid
        });
        $("#staff-enrollment-feedback").textContent = "Código revocado.";
      } catch (error) {
        console.error("No se pudo revocar el código:", error);
        $("#staff-enrollment-feedback").textContent = "No se pudo revocar el código. Volvé a intentarlo.";
        revoke.disabled = false;
      }
    });
    row.append(value, copy, revoke);
    list.appendChild(row);
  }
}

function downloadEnrollmentCodesCsv(codes) {
  if (!Array.isArray(codes) || !codes.length) {
    throw new Error("No hay códigos guardados para descargar.");
  }
  const newline = String.fromCharCode(13, 10);
  const csv = "\uFEFFCódigo de inscripción" + newline + codes.join(newline) + newline;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "buffet411-codigos-inscripcion.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function startEnrollmentCodeManager(user) {
  const section = $("#staff-enrollment-tools");
  if (currentAuthorizedRole !== "admin") {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  if (stopEnrollmentCodesListener) stopEnrollmentCodesListener();

  const codesQuery = query(
    collection(db, "enrollmentCodes"),
    where("status", "==", "available")
  );
  stopEnrollmentCodesListener = onSnapshot(codesQuery, renderEnrollmentCodes, (error) => {
    console.error("No se pudieron consultar los códigos:", error);
    $("#staff-enrollment-feedback").textContent = error.code === "permission-denied"
      ? "Tu cuenta no tiene permiso para administrar códigos."
      : "No se pudieron cargar los códigos disponibles.";
  });

  const createButton = $("#staff-enrollment-create");
  const quantityInput = $("#staff-enrollment-quantity");
  createButton.onclick = async () => {
    if (!auth.currentUser || auth.currentUser.uid !== user.uid || currentAuthorizedRole !== "admin") {
      $("#staff-enrollment-feedback").textContent = "La sesión administrativa ya no está vigente. Volvé a ingresar.";
      return;
    }

    const requestedCount = Number(quantityInput.value);
    if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 300) {
      $("#staff-enrollment-feedback").textContent = "Ingresá una cantidad entera entre 1 y 300.";
      quantityInput.focus();
      return;
    }

    createButton.disabled = true;
    quantityInput.disabled = true;
    const savedCodes = [];
    let saveError = null;
    try {
      const codes = generateEnrollmentCodes(requestedCount);
      const chunkSize = 5;
      for (let offset = 0; offset < codes.length; offset += chunkSize) {
        const chunk = codes.slice(offset, offset + chunkSize);
        const batch = writeBatch(db);
        for (const code of chunk) {
          batch.set(doc(db, "enrollmentCodes", code), {
            status: "available",
            createdAt: serverTimestamp(),
            createdBy: user.uid
          });
        }
        await batch.commit();
        savedCodes.push(...chunk);
        $("#staff-enrollment-feedback").textContent =
          "Guardados " + savedCodes.length + " de " + requestedCount + " códigos…";
      }
    } catch (error) {
      saveError = error;
      console.error("No se pudo completar el lote de códigos:", error);
    } finally {
      createButton.disabled = false;
      quantityInput.disabled = false;
    }

    if (savedCodes.length) {
      try {
        downloadEnrollmentCodesCsv(savedCodes);
      } catch (downloadError) {
        console.error("No se pudo descargar el CSV:", downloadError);
        $("#staff-enrollment-feedback").textContent =
          "Se guardaron " + savedCodes.length + " códigos, pero no se pudo descargar el CSV. Podés copiarlos desde la lista.";
        return;
      }
    }

    if (saveError) {
      $("#staff-enrollment-feedback").textContent = savedCodes.length
        ? "Se guardaron y descargaron " + savedCodes.length + " de " + requestedCount + " códigos. El resto no se creó; revisá permisos y volvé a intentarlo con otra cantidad."
        : saveError.code === "permission-denied"
          ? "Firebase rechazó la creación. Verificá que tu cuenta sea administradora y que las reglas estén actualizadas."
          : saveError.message || "No se pudo crear el lote. Intentá nuevamente.";
      return;
    }

    $("#staff-enrollment-feedback").textContent =
      "Listo: se guardaron " + savedCodes.length + " códigos y se descargó el CSV. Entregá uno a cada alumno y no compartas la lista públicamente.";
  };
}

function dateLabel(dateKey) {
  const date = new Date(dateKey + "T12:00:00Z");
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long", day: "numeric", month: "long",
    timeZone: "America/Argentina/Cordoba"
  }).format(date);
}

function createActionButton(label, action, orderId, kind = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button-outline staff-order-action";
  if (kind) button.dataset.kind = kind;
  button.textContent = label;
  button.addEventListener("click", async () => {
    const key = orderId + ":" + action.key;
    if (orderActionsBusy.has(key)) return;
    orderActionsBusy.add(key);
    button.disabled = true;
    try {
      const orderRef = doc(db, "orders", orderId);
      if (action.key === "payment") {
        await updateDoc(orderRef, {
          paymentStatus: "paid",
          updatedAt: serverTimestamp()
        });
      } else if (action.key === "cancelled") {
        await runTransaction(db, async (transaction) => {
          const orderSnapshot = await transaction.get(orderRef);
          if (!orderSnapshot.exists()) throw new Error("El pedido ya no existe.");
          const order = orderSnapshot.data();
          if (!["pending", "accepted"].includes(order.status)) {
            throw new Error("El estado del pedido cambió. Actualizá la lista.");
          }

          const availabilityRef = doc(db, "dailyAvailability", String(order.serviceDateNumber));
          const stockSnapshot = await transaction.get(availabilityRef);
          transaction.update(orderRef, {
            status: "cancelled",
            updatedAt: serverTimestamp()
          });

          if (stockSnapshot.exists()) {
            const stock = stockSnapshot.data();
            transaction.update(availabilityRef, {
              bizcochosRemaining: Number(stock.bizcochosRemaining || 0) + Number(order.items?.bizcochos || 0),
              facturasRemaining: Number(stock.facturasRemaining || 0) + Number(order.items?.facturas || 0),
              updatedAt: serverTimestamp(),
              updatedBy: auth.currentUser.uid,
              lastOrderId: orderId,
              lastAction: "released"
            });
          }
        });
      } else {
        await updateDoc(orderRef, {
          status: action.key,
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error("No se pudo actualizar el pedido:", error);
      const status = $("#staff-orders-status");
      status.textContent = error.code === "permission-denied"
        ? "SIN PERMISO PARA ACTUALIZAR"
        : "ERROR AL ACTUALIZAR";
    } finally {
      orderActionsBusy.delete(key);
      button.disabled = false;
    }
  });
  return button;
}

function renderOrderCard(order) {
  const card = document.createElement("article");
  card.className = "staff-order-card";

  const top = document.createElement("div");
  top.className = "staff-order-top";
  const identity = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = order.displayName || "Alumno";
  const course = document.createElement("small");
  course.textContent = (order.course || "Curso no indicado") + " · " + (order.division || "División no indicada");
  identity.append(name, course);
  const id = document.createElement("span");
  id.className = "staff-order-id";
  id.textContent = "#" + order.id.slice(0, 8).toUpperCase();
  top.append(identity, id);

  const meta = document.createElement("p");
  meta.className = "student-order-meta";
  const itemText = [];
  if (order.items?.bizcochos) itemText.push(order.items.bizcochos + " bizcocho(s)");
  if (order.items?.facturas) itemText.push(order.items.facturas + " factura(s)");
  const slot = order.pickupSlot === "primer-recreo" ? "08:50–09:00" : "10:20–10:30";
  meta.textContent = itemText.join(" · ") + " · Retiro " + slot;

  const statusLine = document.createElement("div");
  statusLine.className = "staff-order-status-line";
  const status = document.createElement("span");
  status.className = "student-order-status status-" + order.status;
  const labels = {
    pending: "Pendiente", accepted: "Aceptado", preparing: "En preparación",
    ready: "Listo para retirar", delivered: "Entregado", cancelled: "Cancelado"
  };
  status.textContent = labels[order.status] || order.status;
  const payment = document.createElement("span");
  payment.className = "staff-order-payment";
  payment.textContent = (order.paymentMethod === "cash" ? "Efectivo" : "Mercado Pago")
    + " · " + (order.paymentStatus === "paid" ? "Pago confirmado"
      : order.paymentStatus === "pending_review" ? "Verificar pago" : "Sin confirmar");
  statusLine.append(status, payment);

  const footer = document.createElement("div");
  footer.className = "staff-order-footer";
  const total = document.createElement("strong");
  total.textContent = formatARS(order.total);
  const actions = document.createElement("div");
  actions.className = "staff-order-actions";

  if (order.status === "pending") {
    actions.append(createActionButton("Aceptar pedido", { key: "accepted" }, order.id, "primary"));
    actions.append(createActionButton("Cancelar", { key: "cancelled" }, order.id));
  } else if (order.status === "accepted") {
    actions.append(createActionButton("Empezar preparación", { key: "preparing" }, order.id, "primary"));
    actions.append(createActionButton("Cancelar", { key: "cancelled" }, order.id));
  } else if (order.status === "preparing") {
    actions.append(createActionButton("Marcar listo", { key: "ready" }, order.id, "primary"));
  } else if (order.status === "ready") {
    actions.append(createActionButton("Marcar entregado", { key: "delivered" }, order.id, "primary"));
  }

  if (order.paymentStatus !== "paid" && order.status !== "cancelled") {
    actions.append(createActionButton("Confirmar pago", { key: "payment" }, order.id));
  }
  footer.append(total, actions);
  card.append(top, meta, statusLine, footer);
  return card;
}

function normalizeOrderSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

function getFilteredStaffOrders(orders) {
  const search = normalizeOrderSearch($("#staff-orders-search").value);
  const slot = $("#staff-orders-slot-filter").value;
  const status = $("#staff-orders-status-filter").value;
  const payment = $("#staff-orders-payment-filter")?.value || "all";

  return orders.filter((order) => {
    if (status === "active" && order.status === "cancelled") return false;
    if (status !== "active" && status !== "all" && order.status !== status) return false;
    if (slot !== "all" && order.pickupSlot !== slot) return false;
    if (payment !== "all" && order.paymentStatus !== payment) return false;
    if (!search) return true;

    const searchableText = normalizeOrderSearch([
      order.displayName,
      order.course,
      order.division,
      order.id
    ].join(" "));
    return searchableText.includes(search);
  });
}

function updateOrdersPagination(total) {
  const totalPages = Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  const first = total ? (currentPage - 1) * ORDERS_PAGE_SIZE + 1 : 0;
  const last = Math.min(currentPage * ORDERS_PAGE_SIZE, total);

  $("#staff-orders-page-info").textContent = total
    ? "Mostrando " + first + "–" + last + " de " + total + " pedidos"
    : "Sin pedidos para mostrar";
  $("#staff-orders-page-prev").disabled = currentPage <= 1;
  $("#staff-orders-page-next").disabled = currentPage >= totalPages;
}

function renderStaffOrders(orders) {
  const list = $("#staff-orders-list");
  list.replaceChildren();

  const activeOrders = orders.filter((order) => order.status !== "cancelled");
  const first = { bizcochos: 0, facturas: 0 };
  const last = { bizcochos: 0, facturas: 0 };
  let totalBizcochos = 0;
  let totalFacturas = 0;

  for (const order of activeOrders) {
    const slot = order.pickupSlot === "primer-recreo" ? first : last;
    slot.bizcochos += Number(order.items?.bizcochos || 0);
    slot.facturas += Number(order.items?.facturas || 0);
    totalBizcochos += Number(order.items?.bizcochos || 0);
    totalFacturas += Number(order.items?.facturas || 0);
  }

  $("#staff-orders-count").textContent = String(activeOrders.length);
  $("#staff-bizcochos-total").textContent = String(totalBizcochos);
  $("#staff-facturas-total").textContent = String(totalFacturas);
  $("#staff-first-bizcochos").textContent = String(first.bizcochos);
  $("#staff-first-facturas").textContent = String(first.facturas);
  $("#staff-last-bizcochos").textContent = String(last.bizcochos);
  $("#staff-last-facturas").textContent = String(last.facturas);
  $("#staff-orders-status").textContent = activeOrders.length
    ? activeOrders.length + " PEDIDO(S) ACTIVOS"
    : "SIN PEDIDOS ACTIVOS";

  const paymentBuckets = {
    unpaid: { count: 0, total: 0 },
    pending_review: { count: 0, total: 0 },
    paid: { count: 0, total: 0 }
  };
  for (const order of activeOrders) {
    const bucket = paymentBuckets[order.paymentStatus];
    if (bucket) {
      bucket.count += 1;
      bucket.total += Number(order.total || 0);
    }
  }
  $("#staff-payment-cash-pending").textContent = formatARS(paymentBuckets.unpaid.total);
  $("#staff-payment-cash-count").textContent = paymentBuckets.unpaid.count + " pedido(s)";
  $("#staff-payment-mp-pending").textContent = formatARS(paymentBuckets.pending_review.total);
  $("#staff-payment-mp-count").textContent = paymentBuckets.pending_review.count + " pedido(s)";
  $("#staff-payment-paid").textContent = formatARS(paymentBuckets.paid.total);
  $("#staff-payment-paid-count").textContent = paymentBuckets.paid.count + " pedido(s)";

  const sortedOrders = [...orders].sort((a, b) => {
    const courseA = (a.course || "") + (a.division || "") + (a.displayName || "");
    const courseB = (b.course || "") + (b.division || "") + (b.displayName || "");
    return courseA.localeCompare(courseB, "es", { sensitivity: "base", numeric: true });
  });
  const filteredOrders = getFilteredStaffOrders(sortedOrders);
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / ORDERS_PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  const start = (currentPage - 1) * ORDERS_PAGE_SIZE;
  const pageOrders = filteredOrders.slice(start, start + ORDERS_PAGE_SIZE);

  if (!pageOrders.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const icon = document.createElement("span");
    icon.textContent = "≡";
    const heading = document.createElement("strong");
    heading.textContent = orders.length
      ? "No hay pedidos que coincidan"
      : "Todavía no hay pedidos";
    const text = document.createElement("p");
    text.textContent = orders.length
      ? "Probá cambiar la búsqueda o los filtros."
      : "Cuando un alumno confirme su encargo, aparecerá acá.";
    empty.append(icon, heading, text);
    list.appendChild(empty);
  } else {
    pageOrders.forEach((order) => list.appendChild(renderOrderCard(order)));
  }

  updateOrdersPagination(filteredOrders.length);
}

function setOrdersConnectionState(state, title, description) {
  $("#staff-mode-badge").textContent = state;
  $("#staff-notice-title").textContent = title;
  $("#staff-notice-text").textContent = description;
}

function calendarDateKey(value) {
  const digits = String(value || "").replace(/\D/g, "").padStart(8, "0");
  if (digits.length !== 8) return "";
  return digits.slice(0, 4) + "-" + digits.slice(4, 6) + "-" + digits.slice(6, 8);
}

function getCalendarOptions() {
  return {
    openDates: schoolDayEntries.filter((entry) => entry.open).map((entry) => calendarDateKey(entry.dateNumber)),
    closedDates: schoolDayEntries.filter((entry) => !entry.open).map((entry) => calendarDateKey(entry.dateNumber))
  };
}

function renderSchoolCalendar() {
  const list = $("#staff-calendar-list");
  if (!list) return;
  list.replaceChildren();

  const today = getDateNumber(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Cordoba",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date()));
  const upcoming = schoolDayEntries
    .filter((entry) => Number(entry.dateNumber) >= today)
    .sort((a, b) => Number(a.dateNumber) - Number(b.dateNumber));

  if (!upcoming.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state compact";
    empty.textContent = "No hay excepciones cargadas. Se usa el calendario habitual de lunes a viernes.";
    list.appendChild(empty);
    return;
  }

  for (const entry of upcoming) {
    const row = document.createElement("div");
    row.className = "staff-calendar-row";
    const details = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = dateLabel(calendarDateKey(entry.dateNumber));
    const description = document.createElement("small");
    description.textContent = (entry.open ? "Jornada habilitada" : "Sin clases")
      + (entry.label ? " · " + entry.label : "");
    details.append(title, description);
    const state = document.createElement("span");
    state.className = entry.open ? "staff-calendar-open" : "staff-calendar-closed";
    state.textContent = entry.open ? "ABIERTA" : "CERRADA";
    row.append(details, state);

    if (currentAuthorizedRole === "admin") {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "button button-quiet";
      remove.textContent = "Quitar excepción";
      remove.addEventListener("click", async () => {
        if (!window.confirm("¿Quitar esta excepción y volver al calendario habitual?")) return;
        remove.disabled = true;
        try {
          await deleteDoc(doc(db, "schoolDays", String(entry.dateNumber)));
          $("#staff-calendar-feedback").textContent = "Se quitó la excepción del calendario.";
        } catch (error) {
          console.error("No se pudo quitar la excepción:", error);
          $("#staff-calendar-feedback").textContent = "No se pudo modificar el calendario. Revisá tus permisos.";
          remove.disabled = false;
        }
      });
      row.appendChild(remove);
    }
    list.appendChild(row);
  }
}

function startCatalogSettingsListener() {
  $("#staff-catalog-form").hidden = currentAuthorizedRole !== "admin";
  stopCatalogListener = onSnapshot(doc(db, "settings", "catalog"), (snapshot) => {
    if (!snapshot.exists()) {
      $("#staff-catalog-state").textContent = "CATÁLOGO PENDIENTE";
      $("#staff-catalog-feedback").textContent = "Guardá los precios iniciales para habilitar los pedidos. Valores sugeridos: Bizcochos $500 y Facturas $1.000.";
      $("#staff-price-bizcochos").value = "500";
      $("#staff-price-facturas").value = "1000";
      $("#staff-active-bizcochos").checked = true;
      $("#staff-active-facturas").checked = true;
      return;
    }

    const products = snapshot.data().products || {};
    $("#staff-catalog-state").textContent = "CATÁLOGO ACTIVO";
    $("#staff-price-bizcochos").value = String(products.bizcochos?.price ?? 500);
    $("#staff-price-facturas").value = String(products.facturas?.price ?? 1000);
    $("#staff-active-bizcochos").checked = products.bizcochos?.active === true;
    $("#staff-active-facturas").checked = products.facturas?.active === true;
    $("#staff-catalog-feedback").textContent = "Los precios guardados se aplicarán a los pedidos nuevos. Los pedidos existentes conservan su total original.";
  }, (error) => {
    console.error("No se pudo cargar el catálogo:", error);
    $("#staff-catalog-state").textContent = "ERROR DE CATÁLOGO";
    $("#staff-catalog-feedback").textContent = "No se pudieron leer los precios. Revisá los permisos y la conexión.";
  });
}

function listenForDailyAvailability(dateNumber, dateKey) {
  if (stopAvailabilityListener) stopAvailabilityListener();
  $("#staff-stock-date").textContent = dateLabel(dateKey);
  $("#staff-stock-form").hidden = false;
  stopAvailabilityListener = onSnapshot(doc(db, "dailyAvailability", String(dateNumber)), (snapshot) => {
    if (!snapshot.exists()) {
      $("#staff-stock-bizcochos").value = "0";
      $("#staff-stock-facturas").value = "0";
      $("#staff-stock-feedback").textContent = "Todavía no se cargó el stock para esta jornada. Ingresá las unidades disponibles.";
      return;
    }
    const stock = snapshot.data();
    $("#staff-stock-bizcochos").value = String(stock.bizcochosRemaining);
    $("#staff-stock-facturas").value = String(stock.facturasRemaining);
    $("#staff-stock-feedback").textContent = "Stock actualizado en vivo. Los pedidos lo descuentan automáticamente y las cancelaciones lo restituyen.";
  }, (error) => {
    console.error("No se pudo consultar el stock diario:", error);
    $("#staff-stock-feedback").textContent = "No se pudo consultar el stock. Revisá la conexión y los permisos.";
  });
}

$("#staff-catalog-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const feedback = $("#staff-catalog-feedback");
  if (currentAuthorizedRole !== "admin" || !auth.currentUser || auth.currentUser.uid !== currentAuthorizedUid) {
    feedback.textContent = "Solo administración puede modificar precios y disponibilidad del catálogo.";
    return;
  }

  const bizcochosPrice = Number($("#staff-price-bizcochos").value);
  const facturasPrice = Number($("#staff-price-facturas").value);
  if (!Number.isSafeInteger(bizcochosPrice) || bizcochosPrice < 1 || bizcochosPrice > 100000 ||
      !Number.isSafeInteger(facturasPrice) || facturasPrice < 1 || facturasPrice > 100000) {
    feedback.textContent = "Los precios deben ser números enteros entre $1 y $100.000.";
    return;
  }

  const button = $("#staff-catalog-save");
  button.disabled = true;
  feedback.textContent = "Guardando catálogo…";
  try {
    await setDoc(doc(db, "settings", "catalog"), {
      products: {
        bizcochos: { price: bizcochosPrice, active: $("#staff-active-bizcochos").checked },
        facturas: { price: facturasPrice, active: $("#staff-active-facturas").checked }
      },
      updatedAt: serverTimestamp(),
      updatedBy: currentAuthorizedUid
    });
    feedback.textContent = "Catálogo guardado. Los alumnos ya verán los precios y productos actualizados.";
  } catch (error) {
    console.error("No se pudo guardar el catálogo:", error);
    feedback.textContent = error.code === "permission-denied"
      ? "Firebase rechazó el cambio. Confirmá que tu cuenta sea administradora."
      : "No se pudo guardar el catálogo. Intentá nuevamente.";
  } finally {
    button.disabled = false;
  }
});

$("#staff-stock-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const feedback = $("#staff-stock-feedback");
  if (!["staff", "admin"].includes(currentAuthorizedRole) ||
      !auth.currentUser || auth.currentUser.uid !== currentAuthorizedUid ||
      !activeStaffServiceDateNumber) {
    feedback.textContent = "Volvé a ingresar con una cuenta autorizada para administrar stock.";
    return;
  }

  const bizcochosRemaining = Number($("#staff-stock-bizcochos").value);
  const facturasRemaining = Number($("#staff-stock-facturas").value);
  if (!Number.isSafeInteger(bizcochosRemaining) || bizcochosRemaining < 0 || bizcochosRemaining > 5000 ||
      !Number.isSafeInteger(facturasRemaining) || facturasRemaining < 0 || facturasRemaining > 5000) {
    feedback.textContent = "El stock debe ser un número entero entre 0 y 5.000 unidades.";
    return;
  }

  const button = $("#staff-stock-save");
  button.disabled = true;
  feedback.textContent = "Guardando stock…";
  try {
    await setDoc(doc(db, "dailyAvailability", String(activeStaffServiceDateNumber)), {
      dateNumber: activeStaffServiceDateNumber,
      bizcochosRemaining,
      facturasRemaining,
      updatedAt: serverTimestamp(),
      updatedBy: currentAuthorizedUid,
      lastOrderId: "",
      lastAction: "configured"
    });
    feedback.textContent = "Stock guardado para la próxima jornada.";
  } catch (error) {
    console.error("No se pudo guardar el stock:", error);
    feedback.textContent = error.code === "permission-denied"
      ? "Firebase rechazó el cambio. Revisá tu rol y las reglas de stock."
      : "No se pudo guardar el stock. Intentá nuevamente.";
  } finally {
    button.disabled = false;
  }
});

function startStaffOrders() {
  stopStaffOrders();
  setOrdersConnectionState(
    "CONECTANDO…",
    "Comprobando conexión",
    "Estamos consultando Firestore para verificar el acceso a los pedidos."
  );
  $("#staff-orders-status").textContent = "CARGANDO…";
  $("#staff-calendar-form").hidden = currentAuthorizedRole !== "admin";
  $("#staff-stock-form").hidden = false;
  startCatalogSettingsListener();

  stopSchoolDaysListener = onSnapshot(collection(db, "schoolDays"), (calendarSnapshot) => {
    schoolDayEntries = calendarSnapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
      dateNumber: Number(item.data().dateNumber || item.id)
    }));
    renderSchoolCalendar();

    let dateKey;
    try {
      dateKey = getNextSchoolDate(new Date(), { ...getCalendarOptions(), maxDays: 7 });
    } catch (error) {
      setOrdersConnectionState("ERROR DE CALENDARIO", "No encontramos una jornada", "Revisá las excepciones del calendario escolar.");
      $("#staff-orders-status").textContent = "ERROR DE CALENDARIO";
      return;
    }

    const number = getDateNumber(dateKey);
    $("#staff-next-date").textContent = dateLabel(dateKey);
    if (number === activeStaffServiceDateNumber && stopOrdersListener) return;
    activeStaffServiceDateNumber = number;
    listenForDailyAvailability(number, dateKey);
    if (stopOrdersListener) stopOrdersListener();

    const ordersQuery = query(
      collection(db, "orders"),
      where("serviceDateNumber", "==", number)
    );
    stopOrdersListener = onSnapshot(ordersQuery, { includeMetadataChanges: true }, (snapshot) => {
      if (snapshot.metadata.fromCache) {
        setOrdersConnectionState(
          "DATOS EN CACHÉ",
          "Mostrando datos guardados",
          "Todavía no se confirmó la conexión con Firestore. Los datos pueden estar desactualizados."
        );
      } else {
        setOrdersConnectionState(
          "PEDIDOS EN VIVO",
          "Pedidos conectados",
          "La conexión con Firestore está confirmada. Los pedidos y sus estados se actualizan en tiempo real."
        );
      }
      allOrders = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderStaffOrders(allOrders);
    }, (error) => {
      console.error("No se pudieron cargar los pedidos del buffet:", error);
      const permissionDenied = error.code === "permission-denied";
      setOrdersConnectionState(
        permissionDenied ? "SIN PERMISO" : "ERROR DE CONEXIÓN",
        permissionDenied ? "Firestore rechazó el acceso" : "No se pudo conectar",
        permissionDenied
          ? "La cuenta inició sesión, pero Firestore no permite consultar los pedidos. Hay que revisar las reglas."
          : "No pudimos consultar los pedidos. Comprobá la conexión a internet e intentá nuevamente."
      );
      $("#staff-orders-status").textContent = permissionDenied ? "ACCESO DENEGADO" : "ERROR DE CONEXIÓN";
      $("#staff-orders-list").textContent = permissionDenied
        ? "La cuenta está autorizada para entrar, pero Firestore no permite leer los pedidos. Revisá las reglas."
        : "No se pudieron consultar los pedidos. Revisá la conexión e intentá nuevamente.";
    });
  }, (error) => {
    console.error("No se pudo cargar el calendario escolar:", error);
    setOrdersConnectionState(
      error.code === "permission-denied" ? "SIN PERMISO" : "ERROR DE CALENDARIO",
      "No se pudo consultar el calendario",
      "Revisá la conexión y los permisos de lectura del calendario escolar."
    );
    $("#staff-orders-status").textContent = "ERROR DE CALENDARIO";
  });
}

$("#staff-calendar-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const feedback = $("#staff-calendar-feedback");
  if (currentAuthorizedRole !== "admin" || !auth.currentUser || auth.currentUser.uid !== currentAuthorizedUid) {
    feedback.textContent = "Solo administración puede modificar el calendario.";
    return;
  }

  const dateKey = $("#staff-calendar-date").value;
  const label = $("#staff-calendar-label").value.trim();
  const dateNumber = getDateNumber(dateKey);
  const openDate = new Date(dateKey + "T12:00:00Z");
  const selectedAsOpen = $("#staff-calendar-open").value === "true";
  const isWeekend = openDate.getUTCDay() === 0 || openDate.getUTCDay() === 6;
  const today = getDateNumber(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Cordoba",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date()));
  if (!dateKey || !Number.isFinite(openDate.getTime()) || dateNumber <= today ||
      label.length > 80 || (selectedAsOpen && isWeekend)) {
    feedback.textContent = selectedAsOpen && isWeekend
      ? "Las jornadas especiales deben programarse de lunes a viernes."
      : "Elegí una fecha futura y una descripción de hasta 80 caracteres.";
    return;
  }

  const button = $("#staff-calendar-save");
  button.disabled = true;
  feedback.textContent = "Guardando excepción…";
  try {
    await setDoc(doc(db, "schoolDays", String(dateNumber)), {
      dateNumber,
      open: $("#staff-calendar-open").value === "true",
      label,
      updatedAt: serverTimestamp()
    });
    $("#staff-calendar-label").value = "";
    feedback.textContent = "Calendario actualizado. La próxima jornada se recalculó automáticamente.";
  } catch (error) {
    console.error("No se pudo guardar el calendario:", error);
    feedback.textContent = error.code === "permission-denied"
      ? "Firebase rechazó el cambio. Confirmá que ingresaste con una cuenta administradora."
      : "No se pudo guardar la fecha. Revisá la conexión e intentá nuevamente.";
  } finally {
    button.disabled = false;
  }
});


$("#staff-orders-search").addEventListener("input", () => {
  currentPage = 1;
  renderStaffOrders(allOrders);
});

$("#staff-orders-slot-filter").addEventListener("change", () => {
  currentPage = 1;
  renderStaffOrders(allOrders);
});

$("#staff-orders-status-filter").addEventListener("change", () => {
  currentPage = 1;
  renderStaffOrders(allOrders);
});

$("#staff-orders-payment-filter").addEventListener("change", () => {
  currentPage = 1;
  renderStaffOrders(allOrders);
});

document.querySelectorAll("[data-payment-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    $("#staff-orders-payment-filter").value = button.dataset.paymentFilter;
    currentPage = 1;
    renderStaffOrders(allOrders);
    $("#pedidos").scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

$("#staff-orders-page-prev").addEventListener("click", () => {
  currentPage = Math.max(1, currentPage - 1);
  renderStaffOrders(allOrders);
});

$("#staff-orders-page-next").addEventListener("click", () => {
  currentPage += 1;
  renderStaffOrders(allOrders);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  showMessage("Verificando cuenta y permisos…");
  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      emailInput.value.trim(),
      passwordInput.value
    );
    const role = await checkStaffRole(credential.user);
    if (!role) {
      await signOut(auth);
      showLogin("Esta cuenta no tiene permisos para acceder al panel.", "error");
      return;
    }
    showAuthorizedStep(credential.user, role);
  } catch (error) {
    console.error("Error de acceso del personal:", error);
    const text = error.code === "auth/invalid-credential"
      ? "Correo o contraseña incorrectos."
      : error.code === "permission-denied"
        ? "No se pudieron verificar los permisos. Revisá las reglas de Firestore."
        : "No se pudo iniciar sesión. Revisá la conexión e intentá nuevamente.";
    showLogin(text, "error");
  } finally {
    submitButton.disabled = false;
  }
});

enterPanelButton.addEventListener("click", async () => {
  enterPanelButton.disabled = true;
  showMessage("Comprobando permisos nuevamente…");
  try {
    const user = auth.currentUser;
    const role = user && user.uid === currentAuthorizedUid ? await checkStaffRole(user) : null;
    if (!user || !role) {
      await signOut(auth);
      showLogin("Tu autorización ya no está vigente. Iniciá sesión nuevamente.", "error");
      return;
    }
    currentAuthorizedRole = role;
    authPanel.hidden = true;
    dashboard.hidden = false;
    startStaffOrders();
    if (role === "admin") startEnrollmentCodeManager(user);
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    console.error("No se pudieron revalidar los permisos:", error);
    showLogin("No se pudieron comprobar tus permisos. El panel sigue bloqueado.", "error");
  } finally {
    enterPanelButton.disabled = false;
  }
});

logoutButton.addEventListener("click", async () => {
  await signOut(auth);
  showLogin("Sesión cerrada correctamente.", "success");
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    showLogin();
    return;
  }

  dashboard.hidden = true;
  authPanel.hidden = false;

  try {
    const role = await checkStaffRole(user);
    if (role) {
      showAuthorizedStep(user, role);
    } else {
      await signOut(auth);
      showLogin("Esta cuenta no tiene permisos para acceder al panel.", "error");
    }
  } catch (error) {
    console.error("No se pudieron verificar los permisos:", error);
    await signOut(auth);
    showLogin("No se pudieron verificar los permisos. El panel quedó bloqueado.", "error");
  }
});

}
