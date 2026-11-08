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
    doc,
    getDoc,
    onSnapshot,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where
  } = await import("https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js");
  const { formatARS, getNextSchoolDate, getDateNumber } = await import("./domain.js");
  const { generateEnrollmentCode } = await import("./enrollment.js");

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
  stopOrdersListener = null;
  stopEnrollmentCodesListener = null;
  $("#staff-enrollment-tools").hidden = true;
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
  createButton.onclick = async () => {
    if (!auth.currentUser || auth.currentUser.uid !== user.uid || currentAuthorizedRole !== "admin") {
      $("#staff-enrollment-feedback").textContent = "La sesión administrativa ya no está vigente. Volvé a ingresar.";
      return;
    }
    createButton.disabled = true;
    try {
      const code = generateEnrollmentCode();
      await setDoc(doc(db, "enrollmentCodes", code), {
        status: "available",
        createdAt: serverTimestamp(),
        createdBy: user.uid
      });
      $("#staff-enrollment-feedback").textContent = "Código creado. Copialo y entregalo a un solo alumno.";
    } catch (error) {
      console.error("No se pudo crear el código:", error);
      $("#staff-enrollment-feedback").textContent = error.code === "permission-denied"
        ? "Firebase rechazó la creación. Verificá que las reglas nuevas estén publicadas y que tu cuenta sea administradora."
        : error.message || "No se pudo crear el código. Intentá nuevamente.";
    } finally {
      createButton.disabled = false;
    }
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
      const patch = { updatedAt: serverTimestamp() };
      if (action.key === "payment") patch.paymentStatus = "paid";
      else patch.status = action.key;
      await updateDoc(doc(db, "orders", orderId), patch);
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

  return orders.filter((order) => {
    if (status === "active" && order.status === "cancelled") return false;
    if (status !== "active" && status !== "all" && order.status !== status) return false;
    if (slot !== "all" && order.pickupSlot !== slot) return false;
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

function startStaffOrders() {
  stopStaffOrders();
  setOrdersConnectionState(
    "CONECTANDO…",
    "Comprobando conexión",
    "Estamos consultando Firestore para verificar el acceso a los pedidos."
  );
  const dateKey = getNextSchoolDate(new Date());
  const number = getDateNumber(dateKey);
  $("#staff-next-date").textContent = dateLabel(dateKey);
  $("#staff-orders-status").textContent = "CARGANDO…";

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
        "La conexión con Firestore está confirmada. Los pedidos y sus estados se actualizan en tiempo real. La administración de stock y calendario se incorporará en la siguiente etapa."
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
        ? "La cuenta inició sesión, pero las reglas de Firestore no permiten consultar los pedidos. Hay que revisar y publicar las reglas de pedidos."
        : "No pudimos consultar los pedidos. Comprobá la conexión a internet e intentá nuevamente."
    );
    $("#staff-orders-status").textContent = permissionDenied
      ? "ACCESO DENEGADO"
      : "ERROR DE CONEXIÓN";
    $("#staff-orders-list").textContent = permissionDenied
      ? "La cuenta está autorizada para entrar, pero Firestore no permite leer los pedidos. Revisá las reglas."
      : "No se pudieron consultar los pedidos. Revisá la conexión e intentá nuevamente.";
  });
}


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
