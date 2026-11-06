import { auth, db } from "./firebase.js";

(function () {
  "use strict";

  // Inicializa Firebase en la aplicación. En esta etapa no realiza lecturas
  // ni escrituras: Firestore permanece cerrado por reglas de seguridad.
  if (auth && db) {
    document.documentElement.setAttribute("data-firebase", "connected");
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
        // La interfaz sigue funcionando aunque el navegador bloquee localStorage.
      }
    });
  });

  var timeZone = "America/Argentina/Cordoba";
  var now = new Date();
  var parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  var hour = Number(parts.find(function (part) { return part.type === "hour"; }).value);
  var minute = Number(parts.find(function (part) { return part.type === "minute"; }).value);
  var currentMinutes = hour * 60 + minute;
  var opening = 13 * 60;
  var closing = 17 * 60;
  var status = document.querySelector("[data-order-window]");

  if (status) {
    status.textContent = currentMinutes >= opening && currentMinutes < closing
      ? "Horario habitual de pedidos: abierto hasta las 17:00"
      : "Horario habitual de pedidos: cerrado; próxima apertura a las 13:00";
  }

  if ("serviceWorker" in navigator && window.location.protocol === "https:") {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {
        // La aplicación sigue funcionando si el service worker no puede instalarse.
      });
    });
  }
})();
