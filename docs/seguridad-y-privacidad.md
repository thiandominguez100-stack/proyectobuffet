# Seguridad y privacidad

## Estado inicial

Firestore inicia con denegación total de lectura y escritura. Esta política se mantiene hasta que se hayan implementado y probado reglas específicas.

## Autenticación

- Firebase Authentication con correo electrónico y contraseña.
- Longitud mínima configurada: 8 caracteres.
- El correo debe estar verificado antes de realizar pedidos.
- La recuperación se realiza mediante el flujo oficial de Firebase Authentication.
- No almacenar contraseñas ni hashes de contraseñas en Firestore.

## Autorización

- Aplicar mínimo privilegio.
- Los alumnos solo acceden a su perfil y pedidos.
- El personal accede a vistas operativas, no a ajustes administrativos salvo permiso expreso.
- Los administradores pueden administrar configuración y cuentas.
- El rol no puede ser cambiado por el propio usuario desde el navegador.
- Toda operación crítica debe validarse con reglas de Firestore, no solo con controles visuales.

## Perfiles y fotos

- El perfil del alumno contiene correo, nombre para mostrar, curso, división, rol y estado.
- El alumno puede cambiar únicamente su nombre para mostrar; no puede cambiar rol, curso, división ni estado.
- La foto se guarda en `profilePhotos/{uid}`, separada del perfil, como JPEG comprimido de hasta 150.000 caracteres.
- Las reglas permiten leer o cambiar la foto únicamente a su titular y no permiten enumerar fotos.
- El archivo original se procesa en el navegador; no se utiliza Firebase Storage.

## Protección de datos

- No incluir datos reales de alumnos en GitHub.
- No subir credenciales de servicio, claves privadas, tokens ni archivos de cuentas de servicio.
- La configuración web de Firebase se considera configuración pública de cliente; no sustituye las reglas de seguridad.
- No recopilar información sensible que no sea necesaria para gestionar los pedidos.
- Usar cuentas y pedidos ficticios durante las pruebas.
- No habilitar la aplicación para alumnos hasta obtener autorización de la escuela y revisar la gestión de datos de menores.

## Limitaciones de servicios

El proyecto debe permanecer en Firebase Spark. No se usarán Storage, Cloud Functions, backups administrados ni otros productos que obliguen a vincular facturación.

Los comprobantes de Mercado Pago se verificarán manualmente sin almacenar archivos. Las fotos del catálogo serán archivos públicos incluidos en el sitio.
