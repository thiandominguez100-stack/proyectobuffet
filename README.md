# Buffet 411

Nueva aplicación web para organizar los encargos del buffet escolar del IPET 411.

## Objetivo

Los alumnos realizan pedidos en línea durante la ventana habilitada. El personal consulta el resumen de producción y los pedidos individuales para preparar la jornada siguiente.

## Stack previsto

- Frontend estático: HTML, CSS y JavaScript.
- Hosting: Firebase Hosting.
- Cuentas: Firebase Authentication con correo electrónico y contraseña.
- Datos compartidos: Cloud Firestore.
- Código y versiones: GitHub.

## Condición de costo

El proyecto se diseña para permanecer en el plan gratuito Firebase Spark y GitHub Free. No se habilitarán Blaze, Firebase Storage, Cloud Functions, servicios pagos ni facturación sin una decisión expresa del responsable del proyecto.

Las cuotas gratuitas tienen límites. Se debe supervisar el uso y diseñar la aplicación para no hacer lecturas innecesarias.

## Reglas funcionales acordadas

- Productos iniciales: Bizcochos ($500) y Facturas ($1.000).
- Pedidos: domingo a viernes, de 13:00 inclusive a antes de las 17:00, hora de Argentina; sábado cerrado.
- Retiro: 08:50–09:00 o 10:20–10:30.
- Los pedidos se asignan a la próxima jornada escolar habilitada. La regla actual contempla lunes a viernes y permite pedir el domingo para retirar el lunes; el sábado queda cerrado. Las excepciones de feriados y jornadas especiales todavía requieren integrar el calendario escolar.
- Métodos de pago: efectivo y Mercado Pago.
- No se almacenarán comprobantes como imágenes en Firebase Storage. La verificación de Mercado Pago será manual.
- Los alumnos tendrán cuenta individual con correo real verificado y contraseña.
- Límite diario: 5 unidades totales por alumno y jornada, combinando Bizcochos y Facturas.
- Los roles previstos son alumno, personal y administrador.

## Estructura

- `public/`: archivos servidos por Firebase Hosting.
- `public/css/`: estilos.
- `public/js/`: lógica del navegador.
- `public/assets/`: imágenes públicas del proyecto.
- `docs/`: arquitectura y decisiones.
- `firestore.rules`: reglas de seguridad de Firestore.
- `firebase.json`: configuración de Hosting y Firestore.

## Cuentas y perfiles de alumnos

- Registro e inicio de sesión con Firebase Authentication (correo y contraseña).
- El registro requiere un código de inscripción individual de un solo uso, emitido desde el panel por una cuenta administradora. El código se consume en la misma transacción que crea el perfil.
- Verificación obligatoria del correo antes de entrar al catálogo.
- Perfil de Firestore con nombre para mostrar, curso y división; el correo queda únicamente en Firebase Authentication.
- El alumno solo puede cambiar su nombre para mostrar; curso, división, rol y estado quedan protegidos.
- Foto elegida desde el dispositivo, procesada localmente y guardada como JPEG cuadrado comprimido en un documento privado de Firestore (máximo 150.000 caracteres).
- No se utiliza Firebase Storage ni se habilita facturación para las fotos.

## Entornos de publicación

- GitHub Pages es solamente una vista estática de demostración: muestra el diseño, mantiene un carrito local de prueba y desactiva registro, inicio de sesión, fotos, lecturas y escrituras de Firestore.
- El modo operativo se habilita fuera de `github.io`, en Firebase Hosting. No se deben introducir contraseñas ni datos de alumnos en la vista de GitHub Pages.
- No abrir el servicio a estudiantes reales hasta que la escuela autorice el tratamiento de datos y se termine la validación de reglas.

## Estado actual

Se está preparando en la rama `security/audit-and-enrollment-codes` una revisión de seguridad que incorpora códigos de inscripción de un solo uso, limita la lectura de perfiles y contadores a los roles que los necesitan, y agrega pruebas del flujo de inscripción. Esta rama no se ha publicado en Firebase Hosting ni en Firestore; requiere validación de CI/emulador y revisión funcional antes de integrarse.

El proyecto Firebase `buffet411-f80af` tiene Hosting y Authentication activos. El usuario confirmó manualmente en Firebase Hosting el flujo principal: los alumnos pueden crear pedidos, el personal los recibe en vivo, puede actualizar su estado y marcar pagos, y el alumno puede consultar sus pedidos. El acceso de alumnos, el catálogo y la gestión básica de pedidos fueron comprobados manualmente.

El panel del personal incorpora ahora búsqueda por nombre, curso, división e identificador, filtros por recreo y estado, y paginación de 25 pedidos por página. Los totales de producción se calculan sobre todos los pedidos activos, independientemente de la página o los filtros visibles. Estos cambios de interfaz están guardados en GitHub, pero todavía deben pasar las pruebas automáticas y publicarse en Firebase Hosting. El repositorio contiene reglas explícitas para pedidos y límites diarios en `firestore.rules`; cualquier cambio de reglas debe publicarse también en Firestore Console. La corrección del horario dominical está preparada en GitHub y debe quedar publicada tanto en Firestore Rules como en Hosting (`public/js/domain.js`) antes de considerar habilitados los pedidos de domingo.

Las pruebas de `npm test` verifican lógica y estructura; no sustituyen una prueba con Firebase ni una prueba del emulador.

El calendario escolar editable y el control de stock/precios todavía no están integrados. La PWA ya tiene iconos PNG de 192×192 y 512×512, además de un icono maskable de 512×512, preparados para la futura TWA con Bubblewrap. Antes de generar la APK faltará validar la PWA con Bubblewrap, definir los datos Android de la aplicación y comprobar el archivo Digital Asset Links del dominio; se debe conservar cualquier keystore de firma existente para poder actualizar la misma app. No abrir el servicio a todos los alumnos hasta completar las pruebas, revisar privacidad/datos y obtener autorización de la escuela. Mantener el proyecto en Firebase Spark; no habilitar Blaze ni servicios pagos sin una decisión expresa del responsable.

## Privacidad

Este repositorio contiene código y documentación, no datos de alumnos. Nunca subir contraseñas, tokens, claves privadas, listas de alumnos, correos reales, pedidos ni comprobantes.

El repositorio está configurado actualmente como público: revisar su visibilidad antes de incorporar material interno o identificable de la escuela.
