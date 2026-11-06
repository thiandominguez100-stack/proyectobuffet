# Modelo de datos — Buffet 411

Este es el modelo propuesto para la primera versión. Las reglas de Firestore se mantienen cerradas hasta implementar y probar la autorización completa.

## Productos

Los datos base iniciales son:

| ID | Nombre | Precio inicial |
|---|---|---:|
| `bizcochos` | Bizcochos | ARS 500 |
| `facturas` | Facturas | ARS 1.000 |

Los importes se guardan como números enteros en pesos argentinos, nunca como texto ni como números decimales.

## Colecciones

### `users/{uid}`

Perfil mínimo de usuario:

- `uid`: igual al UID de Firebase Authentication.
- `email`: correo del usuario autenticado.
- `displayName`: nombre elegido/validado para el uso escolar.
- `course`: curso.
- `division`: división.
- `role`: `student`, `staff` o `admin`.
- `active`: cuenta habilitada o suspendida.
- `createdAt`, `updatedAt`: marcas de tiempo del servidor.

Los alumnos solo podrán crear y modificar campos de perfil permitidos. Nunca podrán asignarse a sí mismos los roles `staff` o `admin`, ni reactivar su propia cuenta.

### `orders/{orderId}`

Un documento por encargo:

- `uid`: UID del alumno.
- `serviceDate`: fecha de la jornada de retiro, formato `YYYY-MM-DD`.
- `pickupSlot`: `primer-recreo` o `ultimo-recreo`.
- `items`: mapa con cantidades de `bizcochos` y `facturas`.
- `quantity`: suma de ambos productos.
- `total`: importe entero calculado con los precios vigentes.
- `paymentMethod`: `cash` o `mercadopago`.
- `paymentStatus`: `unpaid`, `pending_review` o `paid`.
- `status`: `pending`, `accepted`, `preparing`, `ready`, `delivered` o `cancelled`.
- `createdAt`, `updatedAt`, `cancelUntil`: marcas de tiempo del servidor.

No se guardará el correo del alumno en cada pedido. Para el panel operativo se guardará una instantánea mínima de nombre, curso y división cuando sea necesaria para organizar la entrega.

### `studentDailyTotals/{uid_serviceDate}`

Contador único por alumno y jornada:

- `uid`
- `serviceDate`
- `quantity`: total combinado de bizcochos y facturas de todos los pedidos no cancelados.
- `updatedAt`

**Regla invariable:** `quantity <= 5`. La suma no se reinicia al crear otro pedido; todos los encargos de la misma persona para la misma jornada utilizan el mismo contador.

### `schoolDays/{YYYY-MM-DD}`

Calendario de jornadas:

- `open`: si hay actividad escolar.
- `label`: motivo opcional (feriado, jornada especial, vacaciones).
- `updatedAt`.

Se omiten los fines de semana por defecto, salvo que el calendario administrativo marque explícitamente una jornada especial abierta. Los días cerrados tienen prioridad sobre una apertura accidental.

### `dailyAvailability/{YYYY-MM-DD}`

Disponibilidad por producto y jornada:

- `bizcochos`: cantidad que el buffet puede ofrecer.
- `facturas`: cantidad que el buffet puede ofrecer.
- `updatedAt`.

El stock se controla además del límite individual. El total reservado nunca debe exceder el stock diario habilitado.

### `settings/app`

Configuración general: precios, horario de pedidos, franjas de retiro, fecha objetivo activa y parámetros de operación. Solo administración puede modificar precios y calendario; el personal podrá realizar las acciones operativas expresamente autorizadas.

### `activity/{eventId}`

Registro de operaciones administrativas y del personal. No debe incluir contraseñas, tokens ni información sensible innecesaria.

## Consistencia del límite diario

El navegador calcula el carrito para orientar al alumno, pero ese cálculo por sí solo no es una medida de seguridad.

Al confirmar un pedido, el cliente debe usar una transacción de Firestore:

1. Leer `studentDailyTotals/{uid_serviceDate}`.
2. Calcular la nueva suma combinada de unidades.
3. Rechazar si supera 5.
4. Crear el pedido y actualizar el contador dentro de la misma transacción.
5. Reintentar con el valor actualizado si otra operación concurrente cambió el contador.

Las reglas definitivas deben exigir que el pedido y el contador cambien juntos y que `quantity` sea como máximo 5. No se habilitarán escrituras directas de contadores aislados.

La cancelación válida debe actualizar el pedido y liberar la cantidad reservada en el contador de forma atómica. La política exacta de liberación de cupo y la fecha límite se fijarán en reglas antes de habilitar cancelaciones reales.

## Privacidad y acceso

- Alumno: leer su perfil y sus pedidos; crear pedidos propios dentro de los límites.
- Personal: ver pedidos necesarios para producción y retiro; actualizar estados y pagos autorizados.
- Administrador: gestionar productos, precios, calendario, cuentas y permisos.
- Nadie puede leer ni escribir datos si no está autenticado y autorizado.
- Los roles privilegiados se asignan mediante un procedimiento administrativo controlado, nunca desde el formulario público.
- No recopilar direcciones, teléfonos, fecha de nacimiento ni otra información que no sea imprescindible para los encargos.
- Usar datos ficticios hasta que la escuela autorice el tratamiento de datos de alumnos y determine quién será responsable de administrarlos.

## Límites de la versión gratuita

El proyecto se mantiene en Spark: sin Cloud Storage, Cloud Functions, extensiones pagas ni backups administrados. Las fotos de catálogo serán archivos estáticos del repositorio. Los comprobantes no se cargarán como archivos; el personal verificará manualmente los pagos de Mercado Pago.

Las cuotas de Firestore y Hosting son compartidas por el proyecto. Si se supera una cuota de Spark, el servicio afectado puede quedar suspendido hasta el reinicio del período, en lugar de pasar a cobro automático.
