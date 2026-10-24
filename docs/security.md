# Seguridad y datos

## Fase 1 (estado actual)

- Las fotos de prueba no salen del sitio. La única conexión externa es la
  radio, que el iPad abre directamente con el distribuidor de cada emisora
  (Triton, DPS, Mediastream) al tocar una estación. No se envían datos de la app.
- `localStorage` guarda solo preferencias de presentación bajo la clave
  `marco-digital:settings.v1`. Nada sensible.
- Si `localStorage` no está disponible o se borra, la app usa valores por
  defecto y sigue funcionando.
- El repositorio es público y no contiene fotos personales, credenciales ni
  tokens. Las fotos de `assets/photos/` son generadas.

## Principios para la fase 3

- Dropbox con OAuth 2.0 + PKCE, sin secreto de cliente en el JavaScript.
- Permisos mínimos: lectura de archivos y metadatos.
- Ningún token en URLs, registros, mensajes de error ni en el repositorio.
  El panel de diagnóstico no debe mostrar tokens.
- Antes de guardar un token de larga duración, evaluar y documentar aquí los
  riesgos de `localStorage` frente a la reconexión explícita.
- No enviar tokens ni datos a servicios de terceros.

Este documento se completará en la fase 3, después de revisar la documentación
oficial vigente de Dropbox.
