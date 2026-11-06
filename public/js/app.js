import { auth, db } from "./firebase.js";
import {
  PRODUCTS,
  addProductToCart,
  calculateCartTotal,
  countCartUnits,
  createEmptyCart,
  formatARS,
  isOrderWindowOpen,
  removeProductFromCart
} from "./domain.js";

(function () {
  "use strict";

  // Firebase queda inicializado, pero no se consultan ni escriben datos
  // hasta que Auth y las reglas de Firestore estén listas.
  if (auth && db) {
    document.documentElement.setAttribute("data-firebase", "initialized");
  }

  var root = document.documentElement;
  var savedTheme = null;
  try {
    savedTheme = localStorage.getItem("b411-theme");
  } catch (error) {
    savedTheme = null;
  }
  if (savedTheme === "dark" || savedTheme === "light") {
    root.setAttribute("data-theme", savedTheme);
  }

  document.querySelectorAll("[data-toggle-theme]").forEach(function (button) {
    button.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try {
        localStorage.setItem("b411-theme", next);
      } catch (error) {
        // La interfaz sigue funcionando aunque localStorage esté bloqueado.
      }
    });
  });

  var windowStatus = document.querySelector("[data-order-window]");
  if (windowStatus) {
    windowStatus.textContent = isOrderWindowOpen()
      ? "Ahora está dentro del horario habitual de pedidos."
      : "Fuera del horario habitual: los encargos se habilitan de 13:00 a 17:00.";
  }

  var cart = createEmptyCart();
  var cartList = document.querySelector("[data-cart-list]");
  var countTarget = document.querySelector("[data-cart-count]");
  var totalTarget = document.querySelector("[data-cart-total]");
  var feedback = document.querySelector("[data-cart-feedback]");

  function showFeedback(message, kind) {
    if (!feedback) return;
    feedback.textContent = message;
    if (kind) feedback.setAttribute("data-kind", kind);
    else feedback.removeAttribute("data-kind");
  }

  function renderCart() {
    if (!cartList || !countTarget || !totalTarget) return;

    var count = countCartUnits(cart);
    countTarget.textContent = String(count);
    totalTarget.textContent = formatARS(calculateCartTotal(cart));
    cartList.replaceChildren();

    if (count === 0) {
      var empty = document.createElement("p");
      empty.className = "cart-empty";
      empty.textContent = "Todavía no agregaste productos. Elegí bizcochos o facturas para probar el límite.";
      cartList.appendChild(empty);
    } else {
      Object.values(PRODUCTS).forEach(function (product) {
        var quantity = cart[product.id];
        if (!quantity) return;

        var row = document.createElement("div");
        row.className = "cart-item";

        var info = document.createElement("div");
        info.className = "cart-item-info";
        var name = document.createElement("strong");
        name.textContent = product.name;
        var unitPrice = document.createElement("small");
        unitPrice.textContent = formatARS(product.price) + " por unidad";
        info.append(name, unitPrice);

        var controls = document.createElement("div");
        controls.className = "cart-quantity";
        var decrease = document.createElement("button");
        decrease.type = "button";
        decrease.className = "quantity-button";
        decrease.textContent = "−";
        decrease.setAttribute("aria-label", "Quitar una unidad de " + product.name);
        decrease.dataset.cartAction = "decrease";
        decrease.dataset.productId = product.id;

        var quantityLabel = document.createElement("strong");
        quantityLabel.textContent = String(quantity);

        var increase = document.createElement("button");
        increase.type = "button";
        increase.className = "quantity-button";
        increase.textContent = "+";
        increase.setAttribute("aria-label", "Agregar una unidad de " + product.name);
        increase.dataset.cartAction = "increase";
        increase.dataset.productId = product.id;
        increase.disabled = count >= 5;

        controls.append(decrease, quantityLabel, increase);

        var lineTotal = document.createElement("strong");
        lineTotal.className = "cart-item-total";
        lineTotal.textContent = formatARS(product.price * quantity);

        row.append(info, controls, lineTotal);
        cartList.appendChild(row);
      });
    }

    document.querySelectorAll("[data-add-product]").forEach(function (button) {
      button.disabled = count >= 5;
      button.classList.toggle("button-disabled", count >= 5);
      button.textContent = count >= 5 ? "Límite diario alcanzado" :
        (button.dataset.addProduct === "bizcochos" ? "Agregar bizcochos" : "Agregar facturas");
    });
  }

  document.querySelectorAll("[data-add-product]").forEach(function (button) {
    button.addEventListener("click", function () {
      try {
        cart = addProductToCart(cart, button.dataset.addProduct, 1);
        showFeedback("Producto agregado. Llevás " + countCartUnits(cart) + " de 5 unidades.", "success");
        renderCart();
      } catch (error) {
        showFeedback(error.message || "No se pudo agregar el producto.", "error");
      }
    });
  });

  if (cartList) {
    cartList.addEventListener("click", function (event) {
      var button = event.target.closest("[data-cart-action]");
      if (!button) return;
      var productId = button.dataset.productId;
      try {
        if (button.dataset.cartAction === "increase") {
          cart = addProductToCart(cart, productId, 1);
        } else {
          cart = removeProductFromCart(cart, productId, 1);
        }
        showFeedback("Carrito actualizado.", "success");
        renderCart();
      } catch (error) {
        showFeedback(error.message || "No se pudo actualizar el carrito.", "error");
      }
    });
  }

  renderCart();

  if ("serviceWorker" in navigator && window.location.protocol === "https:") {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function () {
        // La aplicación sigue disponible sin el service worker.
      });
    });
  }
})();
