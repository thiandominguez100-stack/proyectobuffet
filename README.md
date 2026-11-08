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
- Pedidos: de 13:00 inclusive a antes de las 17:00, hora de Argentina.
- Retiro: 08:50–09:00 o 10:20–10:30.
- Los pedidos se asignan al próximo día habilitado en el calendario escolar.
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

El proyecto Firebase `buffet411-f80af` ya tiene una app web registrada y una base Cloud Firestore Standard creada. Authentication utiliza correo y contraseña. Las reglas de perfiles y fotos están publicadas y las reglas para pedidos se prepararon en `firestore.rules`, pero todavía deben publicarse en Firebase Console. El código ya guarda pedidos y contadores de cinco unidades en una transacción y conecta la vista de personal; no se debe probar con pedidos reales hasta publicar y validar las reglas de pedidos.

**No usar con cuentas reales ni publicar como operativo** hasta publicar las reglas de pedidos, comprobarlas en Firebase, completar la integración con calendario y stock, y obtener autorización de la escuela.

## Privacidad

Este repositorio contiene código y documentación, no datos de alumnos. Nunca subir contraseñas, tokens, claves privadas, listas de alumnos, correos reales, pedidos ni comprobantes.

El repositorio está configurado actualmente como público: revisar su visibilidad antes de incorporar material interno o identificable de la escuela.
