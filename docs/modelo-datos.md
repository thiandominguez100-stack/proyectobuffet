# Modelo de datos — Buffet 411

Este modelo describe los perfiles y el primer flujo de pedidos implementado en el código. Las reglas de pedidos están preparadas en el repositorio, pero todavía no se han publicado en Firebase ni validado con el emulador.

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
- El correo permanece en Firebase Authentication y no se duplica en Firestore.
- `displayName`: nombre elegido/validado para el uso escolar.
- `course`: curso.
- `division`: división.
- `registrationCodeId`: identificador del código de inscripción consumido; no contiene información del alumno.
- `role`: `student`, `staff` o `admin`.
- `active`: cuenta habilitada o suspendida.
- `createdAt`, `updatedAt`: marcas de tiempo del servidor.

Los alumnos solo podrán crear y modificar campos de perfil permitidos. Nunca podrán asignarse a sí mismos los roles `staff` o `admin`, ni reactivar su propia cuenta.

### `enrollmentCodes/{codeId}`

Código individual de inscripción. El ID es una cadena aleatoria de 16 caracteres del alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.

- Disponible: `status: available`, `createdAt`, `createdBy`.
- Consumido: `status: used`, `usedBy`, `usedAt`.
- Revocado por administración: `status: revoked`, `revokedBy`, `revokedAt`.
- Solo administración puede crear, enumerar y revocar códigos.
- Un alumno autenticado puede consultar un código disponible que conoce; no puede enumerar la colección.
- El código pasa a `used` en la misma transacción que crea `users/{uid}`. Las reglas exigen ambas escrituras; ninguna puede ocurrir por separado.
- No se guarda nombre, DNI, correo ni curso del alumno en el documento del código.

### `profilePhotos/{uid}`

Foto opcional de cada alumno, separada del perfil operativo para no incluir imágenes en las consultas del personal.

- `photoData`: JPEG cuadrado en Data URL, comprimido en el navegador; máximo 150.000 caracteres.
- `updatedAt`: marca de tiempo del servidor.

El documento solo puede ser leído, creado, actualizado o eliminado por su titular.

### `orders/{orderId}`

Un documento por encargo:

- `uid`: UID del alumno.
- `displayName`, `course`, `division`: instantánea mínima del perfil al confirmar.
- `serviceDateAt`: timestamp en medianoche de Argentina (03:00 UTC).
- `serviceDateNumber`: fecha numérica `YYYYMMDD`.
- `dailyTotalId`: ID del contador diario asociado.
- `pickupSlot`: `primer-recreo` o `ultimo-recreo`.
- `items`: mapa con cantidades de `bizcochos` y `facturas`.
- `quantity`: suma de ambos productos.
- `total`: importe entero calculado con los precios vigentes.
- `paymentMethod`: `cash` o `mercadopago`.
- `paymentStatus`: `unpaid`, `pending_review` o `paid`.
- `status`: `pending`, `accepted`, `preparing`, `ready`, `delivered` o `cancelled`.
- `createdAt`: marca de tiempo del servidor; `updatedAt` se agrega cuando el personal cambia estado o pago.

No se guardará el correo del alumno en cada pedido. Para el panel operativo se guardará una instantánea mínima de nombre, curso y división cuando sea necesaria para organizar la entrega.

### `dailyOrderTotals/{uid_YYYYMMDD}`

Contador único por alumno y jornada:

- `uid`
- `serviceDateNumber`: fecha numérica `YYYYMMDD`.
- `quantity`: total combinado de todas las unidades reservadas para la jornada.
- `orderCount`: cantidad de pedidos creados.
- `latestOrderId`: último ID de pedido escrito en la transacción.
- `updatedAt`

**Regla invariable:** `quantity <= 5`. La suma no se reinicia al crear otro pedido; todos los encargos de la misma persona para la misma jornada utilizan el mismo contador.

### `schoolDays/{YYYYMMDD}`

Calendario de jornadas:

- `open`: si hay actividad escolar.
- `label`: motivo opcional (feriado, jornada especial, vacaciones).
- `updatedAt`.

Las reglas actuales permiten lunes a viernes y consultan el documento de la siguiente jornada para rechazar una fecha marcada `open: false`. La selección automática de la próxima fecha después de varios feriados y las jornadas especiales de fin de semana siguen pendientes de la pantalla de calendario.

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

Al confirmar un pedido, el cliente usa una transacción de Firestore:

1. Leer `dailyOrderTotals/{uid_YYYYMMDD}`.
2. Calcular la nueva suma combinada de unidades.
3. Rechazar si supera 5.
4. Crear `orders/{orderId}` y actualizar `dailyOrderTotals/{uid_YYYYMMDD}` dentro de la misma transacción.
5. Reintentar con el valor actualizado si otra operación concurrente cambió el contador.

Las reglas preparadas exigen que el pedido y el contador cambien juntos mediante `getAfter()` y que `quantity` sea como máximo 5. No se habilitan escrituras directas de contadores aislados. Estas reglas aún deben publicarse y probarse en Firebase.

Por ahora, una cancelación de personal cambia el estado del pedido, pero no libera unidades del contador. La cancelación por el propio alumno y la política de devolución del cupo se implementarán después de definir la fecha límite; el límite no se reinicia con pedidos nuevos ni cancelaciones.

## Privacidad y acceso

- Alumno: leer su perfil y foto; actualizar únicamente nombre para mostrar y su foto; crear pedidos propios dentro de los límites.
- Personal: ver pedidos necesarios para producción y retiro; actualizar estados y pagos autorizados.
- Administrador: gestionar productos, precios, calendario, cuentas y permisos.
- Nadie puede leer ni escribir datos si no está autenticado y autorizado.
- Los roles privilegiados se asignan mediante un procedimiento administrativo controlado, nunca desde el formulario público.
- No recopilar direcciones, teléfonos, fecha de nacimiento ni otra información que no sea imprescindible para los encargos.
- Usar datos ficticios hasta que la escuela autorice el tratamiento de datos de alumnos y determine quién será responsable de administrarlos.

## Límites de la versión gratuita

El proyecto se mantiene en Spark: sin Cloud Storage, Cloud Functions, extensiones pagas ni backups administrados. Las fotos de catálogo serán archivos estáticos del repositorio. Los comprobantes no se cargarán como archivos; el personal verificará manualmente los pagos de Mercado Pago.

Las cuotas de Firestore y Hosting son compartidas por el proyecto. Si se supera una cuota de Spark, el servicio afectado puede quedar suspendido hasta el reinicio del período, en lugar de pasar a cobro automático.
