# Seguridad y datos

## Conexiones externas

- **Radio:** el iPad se conecta directamente con el distribuidor de cada
  emisora (Triton, DPS, Mediastream) al tocar una estación.
- **Dropbox:** solo `www.dropbox.com` (inicio de sesión), `api.dropboxapi.com`
  y `content.dropboxapi.com`. No se envían datos a ningún otro servicio.

## Almacenamiento local

- `marco-digital:settings.v1`: preferencias de presentación. Nada sensible.
- `marco-digital:dropbox.v1`: **token de renovación** de Dropbox y la carpeta
  elegida.
- `marco-digital:dropbox.pending`: verificador PKCE y `state`, solo durante el
  inicio de sesión (caduca a los 30 min y se borra al volver).
- Si `localStorage` no está disponible o se borra, la app usa valores por
  defecto y sigue funcionando.
- El repositorio es público y no contiene fotos personales, credenciales ni
  tokens. Las fotos de `assets/photos/` son generadas.

## Dropbox

- OAuth 2.0 con PKCE (S256), sin secreto de aplicación. La App key en
  `assets/js/dropbox/config.js` es pública por diseño.
- Permisos: solo lectura (`files.metadata.read`, `files.content.read`). El
  marco no puede modificar ni borrar nada.
- La aplicación tiene **acceso a todo Dropbox** (decisión del usuario, para
  usar una carpeta existente). El marco solo lista la carpeta elegida, pero el
  token permite leer cualquier archivo.
- El token de acceso (4 h) vive solo en memoria. Ningún token aparece en URLs,
  en el registro, en el panel de diagnóstico ni en mensajes de error. El
  código de autorización se quita de la dirección al volver de Dropbox.
- El `state` se comprueba al volver, para rechazar respuestas que no inició
  este marco.
- Con «Conectar con el teléfono», el código que muestra Dropbox solo se puede
  canjear con el verificador PKCE que guarda el iPad, una sola vez y por pocos
  minutos. Ver o fotografiar el código no da acceso.
- Única biblioteca externa: `assets/js/vendor/qrcode.js` (qrcode-generator
  1.4.4, MIT), copiada sin cambios; solo dibuja el QR y no hace conexiones.

### Riesgo aceptado: token de renovación en `localStorage`

Para que el marco funcione solo tras una recarga o un reinicio del iPad, el
token de renovación se guarda en `localStorage`. No hay almacenamiento más
seguro en Safari 12. Quien tenga el iPad desbloqueado o pueda ejecutar código
en el origen `leonelmerino.github.io` podría leerlo y con él leer el Dropbox.

Mitigaciones:

- Solo lectura; nunca escritura ni borrado.
- **Desconectar** anula el token en Dropbox (`auth/token/revoke`) y lo borra.
- También se puede anular en dropbox.com › Configuración › Aplicaciones
  conectadas; el marco lo detecta y vuelve a las fotos de prueba.
- La página no carga scripts de terceros: todo el código está en este
  repositorio.
- iOS puede borrar `localStorage`; entonces basta con volver a conectar.

La alternativa (no guardar nada y conectar en cada carga) haría que el marco
se quedara sin fotos tras cualquier recarga, lo que no sirve para un marco
desatendido.
