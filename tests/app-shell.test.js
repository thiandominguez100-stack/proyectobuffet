import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, studentPage, staffPage, serviceWorker] = await Promise.all([
  readFile(new URL("../public/js/app.js", import.meta.url), "utf8"),
  readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  readFile(new URL("../public/personal.html", import.meta.url), "utf8"),
  readFile(new URL("../public/sw.js", import.meta.url), "utf8")
]);

test("el módulo principal no se bloquea por referencias Firebase no importadas", () => {
  assert.doesNotMatch(app, /\b(?:auth|db)\b/);
});

test("alumnos y personal cargan el módulo compartido y tienen un control de tema", () => {
  for (const page of [studentPage, staffPage]) {
    assert.match(page, /src="\.\/js\/app\.js"/);
    assert.match(page, /data-toggle-theme/);
  }
});

test("el tema se aplica al cargar, se puede alternar y se guarda", () => {
  assert.match(app, /localStorage\.getItem\("b411-theme"\)/);
  assert.match(app, /applyTheme\(savedTheme === "dark" \? "dark" : "light"\)/);
  assert.match(app, /themeButtons\.forEach/);
  assert.match(app, /localStorage\.setItem\("b411-theme", next\)/);
  assert.match(app, /aria-pressed/);
});

test("la caché de la aplicación cambia de versión al publicar una corrección", () => {
  assert.match(serviceWorker, /buffet411-shell-v8/);
});

test("el panel solo anuncia pedidos en vivo tras confirmar la conexión remota", async () => {
  const staff = await readFile(new URL("../public/js/staff.js", import.meta.url), "utf8");
  assert.match(staff, /CONECTANDO…/);
  assert.match(staff, /snapshot\.metadata\.fromCache/);
  assert.match(staff, /PEDIDOS EN VIVO/);
  assert.match(staff, /SIN PERMISO/);
  assert.match(staff, /No se pudo conectar/);
});
