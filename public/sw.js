"use strict";
var CACHE_NAME = "buffet411-shell-v11";
var APP_SHELL = [
  "/",
  "./index.html",
  "./personal.html",
  "./css/app.css",
  "./js/app.js",
  "./js/firebase.js",
  "./js/staff.js",
  "./js/student-auth.js",
  "./js/enrollment-codes.js",
  "./js/student-orders.js",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil((async function () {
    var cache = await caches.open(CACHE_NAME);
    for (var i = 0; i < APP_SHELL.length; i += 1) {
      try {
        await cache.add(APP_SHELL[i]);
      } catch (error) {
        // Un recurso opcional ausente no debe cancelar toda la instalación.
      }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", function (event) {
  event.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.filter(function (key) {
      return key.indexOf("buffet411-shell-") === 0 && key !== CACHE_NAME;
    }).map(function (key) {
      return caches.delete(key);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", function (event) {
  var request = event.request;
  var url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.indexOf("/__/") === 0 || url.pathname.indexOf("/api/") === 0) return;

  // Network-first: las versiones nuevas llegan al navegador al publicar cambios.
  // La caché es solo un respaldo para recursos estáticos sin conexión.
  event.respondWith((async function () {
    try {
      var fresh = await fetch(request);
      if (fresh && fresh.ok) {
        var cache = await caches.open(CACHE_NAME);
        cache.put(request, fresh.clone()).catch(function () {});
      }
      return fresh;
    } catch (error) {
      var cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === "navigate") {
        return (await caches.match("./index.html")) || Response.error();
      }
      return Response.error();
    }
  })());
});
