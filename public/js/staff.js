import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { formatARS, getNextSchoolDate, getDateNumber } from "./domain.js";

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
let stopOrdersListener = null;
let orderActionsBusy = new Set();

function showMessage(text, kind = "") {
  message.textContent = text;
  if (kind) message.dataset.kind = kind;
  else delete message.dataset.kind;
}

function stopStaffOrders() {
  if (stopOrdersListener) stopOrdersListener();
  stopOrdersListener = null;
  orderActionsBusy = new Set();
}

function showLogin(text = "Solo pueden ingresar cuentas con rol de personal o administrador.", kind = "") {
  stopStaffOrders();
  currentAuthorizedUid = null;
  dashboard.hidden = true;
  authPanel.hidden = false;
  form.hidden = false;
  authorizedStep.hidden = true;
  passwordInput.value = "";
  showMessage(text, kind);
}

function showAuthorizedStep(user) {
  stopStaffOrders();
  currentAuthorizedUid = user.uid;
  dashboard.hidden = true;
  authPanel.hidden = false;
  form.hidden = true;
  authorizedStep.hidden = false;
  showMessage("Acceso autorizado. Tu cuenta está verificada.", "success");
}

async function checkStaffRole(user) {
  const roleSnapshot = await getDoc(doc(db, "staffRoles", user.uid));
  if (!roleSnapshot.exists()) return false;
  const role = roleSnapshot.data().role;
  return role === "staff" || role === "admin";
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

  if (!activeOrders.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const icon = document.createElement("span");
    icon.textContent = "≡";
    const heading = document.createElement("strong");
    heading.textContent = "Todavía no hay pedidos";
    const text = document.createElement("p");
    text.textContent = "Cuando un alumno confirme su encargo, aparecerá acá.";
    empty.append(icon, heading, text);
    list.appendChild(empty);
  } else {
    activeOrders.sort((a, b) => {
      const courseA = (a.course || "") + (a.division || "") + (a.displayName || "");
      const courseB = (b.course || "") + (b.division || "") + (b.displayName || "");
      return courseA.localeCompare(courseB, "es");
    });
    activeOrders.forEach((order) => list.appendChild(renderOrderCard(order)));
  }

  $("#staff-orders-status").textContent = activeOrders.length
    ? activeOrders.length + " PEDIDO(S)"
    : "SIN PEDIDOS";
}

function startStaffOrders() {
  stopStaffOrders();
  const dateKey = getNextSchoolDate(new Date());
  const number = getDateNumber(dateKey);
  $("#staff-next-date").textContent = dateLabel(dateKey);
  $("#staff-orders-status").textContent = "CARGANDO…";

  const ordersQuery = query(
    collection(db, "orders"),
    where("serviceDateNumber", "==", number)
  );
  stopOrdersListener = onSnapshot(ordersQuery, (snapshot) => {
    const orders = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderStaffOrders(orders);
  }, (error) => {
    console.error("No se pudieron cargar los pedidos del buffet:", error);
    $("#staff-orders-status").textContent = error.code === "permission-denied"
      ? "ACCESO DENEGADO"
      : "ERROR DE CONEXIÓN";
    $("#staff-orders-list").textContent = "No se pudieron consultar los pedidos. Revisá las reglas de Firestore y la conexión.";
  });
}

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
    const authorized = await checkStaffRole(credential.user);
    if (!authorized) {
      await signOut(auth);
      showLogin("Esta cuenta no tiene permisos para acceder al panel.", "error");
      return;
    }
    showAuthorizedStep(credential.user);
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
    if (!user || user.uid !== currentAuthorizedUid || !(await checkStaffRole(user))) {
      await signOut(auth);
      showLogin("Tu autorización ya no está vigente. Iniciá sesión nuevamente.", "error");
      return;
    }
    authPanel.hidden = true;
    dashboard.hidden = false;
    startStaffOrders();
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
    const authorized = await checkStaffRole(user);
    if (authorized) {
      showAuthorizedStep(user);
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
