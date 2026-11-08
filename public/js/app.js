import {
  PRODUCTS,
  addProductToCart,
  countCartUnits,
  createEmptyCart,
  formatARS,
  isOrderWindowOpen,
  removeProductFromCart
} from "./domain.js";

(function () {
  "use strict";

  // Firebase se inicializa en los módulos de autenticación y pedidos.
  // Este módulo compartido solo gestiona tema, horario y carrito en ambas páginas.
  var root = document.documentElement;
  var themeButtons = document.querySelectorAll("[data-toggle-theme]");

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    themeButtons.forEach(function (button) {
      var nextTheme = theme === "dark" ? "light" : "dark";
      var label = nextTheme === "dark" ? "Activar modo oscuro" : "Activar modo claro";
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
      button.setAttribute("aria-pressed", String(theme === "dark"));
      button.textContent = theme === "dark" ? "☀" : "☾";
    });
  }

  var savedTheme = null;
  try {
    savedTheme = localStorage.getItem("b411-theme");
  } catch (error) {
    savedTheme = null;
  }
  applyTheme(savedTheme === "dark" ? "dark" : "light");

  themeButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(next);
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
  var checkoutButton = document.querySelector("#checkout-open");
  var bookedQuantity = 0;
  var previewOnly = window.location.hostname !== "buffet411-f80af.web.app";
  var catalogConfigured = previewOnly;
  var stockConfigured = previewOnly;
  var catalogPrices = { bizcochos: PRODUCTS.bizcochos.price, facturas: PRODUCTS.facturas.price };
  var catalogEnabled = { bizcochos: true, facturas: true };
  var stockRemaining = { bizcochos: previewOnly ? 999 : 0, facturas: previewOnly ? 999 : 0 };

  function calculateCurrentTotal(currentCart) {
    return Object.keys(catalogPrices).reduce(function (sum, productId) {
      return sum + catalogPrices[productId] * Number(currentCart[productId] || 0);
    }, 0);
  }

  function isCurrentCartAvailable() {
    if (previewOnly) return true;
    if (!catalogConfigured || !stockConfigured) return false;
    return Object.keys(catalogPrices).every(function (productId) {
      var quantity = Number(cart[productId] || 0);
      return catalogEnabled[productId] && quantity <= stockRemaining[productId];
    });
  }

  function renderProductAvailability() {
    Object.keys(catalogPrices).forEach(function (productId) {
      var price = document.querySelector('[data-product-price="' + productId + '"]');
      var status = document.querySelector('[data-product-availability="' + productId + '"]');
      if (price) price.textContent = formatARS(catalogPrices[productId]);
      if (!status) return;
      if (previewOnly) status.textContent = "Vista de demostración";
      else if (!catalogConfigured) status.textContent = "Catálogo pendiente";
      else if (!stockConfigured) status.textContent = "Stock sin cargar";
      else if (!catalogEnabled[productId]) status.textContent = "No disponible";
      else if (stockRemaining[productId] <= 0) status.textContent = "Agotado";
      else status.textContent = stockRemaining[productId] + " unidades disponibles";
    });
  }

  function showFeedback(message, kind) {
    if (!feedback) return;
    feedback.textContent = message;
    if (kind) feedback.setAttribute("data-kind", kind);
    else feedback.removeAttribute("data-kind");
  }

  function renderCart() {
    if (!cartList || !countTarget || !totalTarget) return;

    var count = countCartUnits(cart);
    var combinedCount = bookedQuantity + count;
    countTarget.textContent = String(combinedCount);
    totalTarget.textContent = formatARS(calculateCurrentTotal(cart));
    renderProductAvailability();
    if (checkoutButton) {
      checkoutButton.disabled = previewOnly || count < 1 || !isCurrentCartAvailable();
      if (previewOnly) checkoutButton.textContent = "Pedidos disponibles en la versión operativa";
    }
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
        unitPrice.textContent = formatARS(catalogPrices[product.id]) + " por unidad";
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
        increase.disabled = combinedCount >= 5 || (!previewOnly && (
          !catalogConfigured || !stockConfigured || !catalogEnabled[product.id] ||
          stockRemaining[product.id] <= quantity
        ));

        controls.append(decrease, quantityLabel, increase);

        var lineTotal = document.createElement("strong");
        lineTotal.className = "cart-item-total";
        lineTotal.textContent = formatARS(catalogPrices[product.id] * quantity);

        row.append(info, controls, lineTotal);
        cartList.appendChild(row);
      });
    }

    document.querySelectorAll("[data-add-product]").forEach(function (button) {
      var productId = button.dataset.addProduct;
      var unavailable = !previewOnly && (
        !catalogConfigured || !stockConfigured || !catalogEnabled[productId] ||
        stockRemaining[productId] <= Number(cart[productId] || 0)
      );
      var disabled = combinedCount >= 5 || unavailable;
      button.disabled = disabled;
      button.classList.toggle("button-disabled", disabled);
      button.textContent = combinedCount >= 5 ? "Límite diario alcanzado" :
        (!catalogConfigured && !previewOnly) ? "Catálogo pendiente" :
        (!stockConfigured && !previewOnly) ? "Stock pendiente" :
        (!catalogEnabled[productId] && !previewOnly) ? "No disponible" :
        (stockRemaining[productId] <= Number(cart[productId] || 0) && !previewOnly) ? "Sin stock" :
        (productId === "bizcochos" ? "Agregar bizcochos" : "Agregar facturas");
    });

    document.dispatchEvent(new CustomEvent("b411:cart-updated", {
      detail: { cart: { ...cart }, count: count, total: calculateCurrentTotal(cart) }
    }));
  }

  document.addEventListener("b411:catalog-config", function (event) {
    var detail = event.detail || {};
    catalogConfigured = detail.configured === true;
    if (detail.products) {
      Object.keys(catalogPrices).forEach(function (productId) {
        var product = detail.products[productId] || {};
        if (Number.isSafeInteger(product.price) && product.price > 0) catalogPrices[productId] = product.price;
        catalogEnabled[productId] = product.active === true;
      });
    }
    renderCart();
  });

  document.addEventListener("b411:stock-update", function (event) {
    var detail = event.detail || {};
    stockConfigured = detail.configured === true;
    if (detail.remaining) {
      Object.keys(stockRemaining).forEach(function (productId) {
        var value = Number(detail.remaining[productId]);
        stockRemaining[productId] = Number.isSafeInteger(value) && value >= 0 ? value : 0;
      });
    }
    renderCart();
  });

  document.addEventListener("b411:daily-total", function (event) {
    bookedQuantity = Math.max(0, Math.min(5, Number(event.detail.quantity || 0)));
    renderCart();
  });

  document.addEventListener("b411:clear-cart", function () {
    cart = createEmptyCart();
    renderCart();
    showFeedback("¡Pedido guardado! Podés consultar su estado en «Mis pedidos».", "success");
  });

  document.querySelectorAll("[data-add-product]").forEach(function (button) {
    button.addEventListener("click", function () {
      try {
        var productId = button.dataset.addProduct;
        if (!previewOnly && (!catalogConfigured || !stockConfigured || !catalogEnabled[productId])) {
          throw new RangeError("Este producto todavía no está disponible para encargar.");
        }
        if (!previewOnly && Number(cart[productId] || 0) >= stockRemaining[productId]) {
          throw new RangeError("No quedan más unidades disponibles de este producto.");
        }
        var candidate = addProductToCart(cart, productId, 1);
        if (bookedQuantity + countCartUnits(candidate) > 5) {
          throw new RangeError("Ya usaste parte del límite diario. Te quedan " + Math.max(0, 5 - bookedQuantity) + " unidad(es).");
        }
        cart = candidate;
        showFeedback("Producto agregado. Llevás " + (bookedQuantity + countCartUnits(cart)) + " de 5 unidades.", "success");
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
          if (!previewOnly && (!catalogConfigured || !stockConfigured || !catalogEnabled[productId])) {
            throw new RangeError("Este producto todavía no está disponible para encargar.");
          }
          if (!previewOnly && Number(cart[productId] || 0) >= stockRemaining[productId]) {
            throw new RangeError("No quedan más unidades disponibles de este producto.");
          }
          var candidate = addProductToCart(cart, productId, 1);
          if (bookedQuantity + countCartUnits(candidate) > 5) {
            throw new RangeError("Ya usaste parte del límite diario. Te quedan " + Math.max(0, 5 - bookedQuantity) + " unidad(es).");
          }
          cart = candidate;
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
