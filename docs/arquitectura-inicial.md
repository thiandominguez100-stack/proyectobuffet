# Arquitectura inicial — Buffet 411

## Entornos

GitHub Pages se reserva para una vista de muestra sin autenticación ni intercambio de datos. Firebase Hosting es el destino operativo; sus módulos de Firebase se cargan solo cuando el host no termina en `.github.io`.

## Dos áreas de la aplicación

### Alumnos — `public/index.html`

- Registro e inicio de sesión con correo real y contraseña.
- Verificación de correo antes de permitir pedidos.
- Perfil con nombre, curso y división.
- Catálogo de Bizcochos y Facturas.
- Carrito local con máximo de 5 unidades combinadas, consultando el contador diario.
- Selección de horario de retiro y método de pago.
- Confirmación transaccional del pedido e historial en tiempo real.
- La cancelación del alumno todavía está pendiente.
- Recuperación de contraseña mediante Firebase Authentication.

### Personal — `public/personal.html`

- Acceso restringido a personal y administradores.
- Vista de producción del próximo día habilitado.
- Totales de productos por horario de retiro.
- Lista de pedidos individuales ordenados por curso/división.
- Totales de Bizcochos y Facturas por recreo.
- Cambio de estado y verificación manual de pagos.
- Administración de productos, stock, calendario y usuarios según permisos.
- Registro de actividad administrativa.

## Reglas operativas acordadas

- Zona horaria: `America/Argentina/Cordoba`.
- Ventana de pedidos: 13:00 inclusive hasta antes de las 17:00.
- Al llegar a las 17:00, se cierra la recepción para el siguiente día habilitado.
- Horarios de retiro: 08:50–09:00 y 10:20–10:30.
- Calendario escolar editable: días sin clases, feriados y jornadas habilitadas.
- Precios iniciales: Bizcochos $500; Facturas $1.000.
- Límite diario combinado: 5 unidades en total por alumno y jornada, sumando ambos productos y todos sus pedidos.
- Precios y disponibilidad podrán ser modificados por roles autorizados.
- Pagos: efectivo o Mercado Pago. El estado de pago lo confirma manualmente el personal.
- No usar Firebase Storage ni subir comprobantes de pago como imágenes.

## Roles

- `student`: consulta y administra su propio perfil y sus pedidos permitidos.
- `staff`: consulta pedidos y producción, actualiza estados y pagos según permisos.
- `admin`: administra usuarios, personal, productos, calendario y configuración.

La asignación de roles privilegiados nunca se hará desde un campo que el propio alumno pueda editar. El primer administrador se inicializará por un procedimiento controlado y se documentará antes de habilitar la aplicación.

## Colecciones previstas

- `users/{uid}`: perfil mínimo, curso, división, rol y estado.
- `orders/{orderId}`: pedido, titular, jornada, franja, productos, total, pago y estado.
- `schoolDays/{date}`: jornada habilitada o cerrada.
- `dailyAvailability/{date}`: disponibilidad/stock por producto.
- `settings/app`: horarios, precios y parámetros operativos.
- `activity/{eventId}`: auditoría de acciones administrativas.
- `dailyOrderTotals/{uid_YYYYMMDD}`: contador diario global por alumno/jornada. La suma de Bizcochos y Facturas, entre todos sus pedidos para esa fecha, nunca podrá superar 5.

El modelo final debe validarse junto con las reglas de Firestore. Las operaciones que afectan al pedido y al contador diario deberán ser atómicas y estar verificadas por reglas; no alcanza con validar solamente desde JavaScript.

## Estrategia de costo cero

- Firebase Spark, una base Firestore Standard gratuita y Authentication por correo/contraseña.
- Hosting estático de Firebase dentro de las cuotas gratuitas.
- Imágenes del catálogo servidas desde archivos estáticos del repositorio.
- Sin Storage, Cloud Functions, extensiones pagas, servicios SMS ni facturación Blaze.
- Sin copias automáticas administradas que requieran facturación; exportaciones manuales de datos y conservación de versiones del código.

## Estado y límites pendientes

El primer flujo de pedidos ya está desarrollado en el código, pero las reglas nuevas de `orders` y `dailyOrderTotals` todavía deben publicarse y validarse en Firebase Console. La próxima fecha automática actualmente contempla días de lunes a viernes; el salto de feriados consecutivos, las aperturas especiales y el control de stock aún no están conectados.

## Límites y decisiones pendientes

1. Definir el comportamiento exacto de cancelación: el límite de las 17:00 del día anterior a la jornada de retiro.
2. Definir si al eliminar una cuenta se borran los pedidos asociados o se anonimizan para estadísticas.
3. Definir el proceso de alta y autorización del personal.
4. Acordar con la escuela qué datos de alumnos son realmente necesarios y quién puede acceder a ellos.
