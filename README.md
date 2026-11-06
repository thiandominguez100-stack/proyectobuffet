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
- Pedidos: de 13:00 a 17:00, hora de Argentina.
- Retiro: 08:50–09:00 o 10:20–10:30.
- Los pedidos se asignan al próximo día habilitado en el calendario escolar.
- Métodos de pago: efectivo y Mercado Pago.
- No se almacenarán comprobantes como imágenes en Firebase Storage. La verificación de Mercado Pago será manual.
- Los alumnos tendrán cuenta individual con correo real y contraseña.
- Los roles previstos son alumno, personal y administrador.

## Estructura

- `public/`: archivos servidos por Firebase Hosting.
- `public/css/`: estilos.
- `public/js/`: lógica del navegador.
- `public/assets/`: imágenes públicas del proyecto.
- `docs/`: arquitectura y decisiones.
- `firestore.rules`: reglas de seguridad de Firestore.
- `firebase.json`: configuración de Hosting y Firestore.

## Estado actual

El proyecto Firebase `buffet411-f80af` ya tiene una app web registrada y una base Cloud Firestore Standard creada. Authentication utiliza correo y contraseña. Las reglas de Firestore permanecen cerradas (`allow read, write: if false`) mientras se prepara el modelo y se prueban las reglas definitivas.

**No usar con cuentas reales ni publicar como operativo** hasta terminar las reglas de seguridad, las pruebas y la revisión de permisos.

## Privacidad

Este repositorio contiene código y documentación, no datos de alumnos. Nunca subir contraseñas, tokens, claves privadas, listas de alumnos, correos reales, pedidos ni comprobantes.

El repositorio está configurado actualmente como público: revisar su visibilidad antes de incorporar material interno o identificable de la escuela.
