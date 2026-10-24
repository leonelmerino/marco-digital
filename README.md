# Marco digital

Aplicación web estática que convierte un **iPad Air de primera generación
(A1474, iOS 12.5.8)** en un marco digital de fotografías con reloj.
Funciona en Safari, sin instalar nada en el iPad, y se publica con GitHub Pages.

**URL:** https://leonelmerino.github.io/marco-digital/

## Estado

| Fase | Contenido | Estado |
| --- | --- | --- |
| 1 | Reloj, fotos de prueba, fundido, controles, configuración | Implementada; **pendiente de validar en el iPad** |
| 2 | Publicación en GitHub Pages | Publicada; pendiente de validar en el iPad |
| 3 | Fotos desde una carpeta privada de Dropbox (OAuth 2.0 + PKCE) | Sin empezar |
| 4 | Música gratuita desde Internet Archive | Sin empezar |
| 5 | Endurecimiento y uso prolongado | Sin empezar |

Una fase solo se da por terminada después de probarla en el iPad real
(ver [tests/manual-test-plan.md](tests/manual-test-plan.md)).

## Uso en el iPad

1. Abre la URL en Safari.
2. Toca la pantalla para mostrar u ocultar los controles (anterior, pausa,
   siguiente, configuración). Se ocultan solos a los 5 segundos.
3. En **Configuración** puedes cambiar el intervalo, el orden, la transición,
   el ajuste de la foto, el reloj, la fecha y el modo nocturno.
4. Para que la pantalla no se apague: **Ajustes › Pantalla y brillo ›
   Bloqueo automático › Nunca**. Para que nadie salga de Safari, puedes usar
   **Acceso Guiado** (Ajustes › Accesibilidad).

Opcional: en Safari, **Compartir › Añadir a pantalla de inicio** abre el marco
sin barras de Safari. Este modo tiene su propio almacenamiento y, en la fase 3,
puede comportarse distinto con el inicio de sesión de Dropbox; hay que probarlo.

### Parámetros de prueba

- `?prueba=error`: añade una foto inexistente para comprobar que la
  presentación la salta sin bloquearse.
- `?prueba=vacio`: simula una carpeta sin fotos.
- El **panel de diagnóstico** (Configuración › Estado y diagnóstico) muestra
  en pantalla el registro de eventos y errores, útil en el iPad, donde no hay
  consola a mano.

## Desarrollo local

No hay dependencias ni paso de compilación. Desde la carpeta del proyecto:

```sh
python3 tools/dev-server.py 8010
```

En el Mac: http://localhost:8010. En el iPad (misma red Wi-Fi):
`http://<IP-del-Mac>:8010` (la IP se obtiene con `ipconfig getifaddr en0`).

Cuando la app se abre desde la red local, envía su registro de diagnóstico al
Mac (`POST /__reporte`), que lo guarda en `reports/ipad-log.jsonl` (ignorado
por Git). Así se leen los errores del iPad sin copiarlos a mano. La versión de
GitHub Pages no envía nada.

Reglas del código, por compatibilidad con Safari 12:

- JavaScript ES2017 como máximo, en scripts clásicos (sin módulos ni
  compilación): nada de `?.`, `??`, campos de clase ni `Object.fromEntries`.
- CSS sin `gap` en flexbox, `inset`, `aspect-ratio` ni `:is()`.
- Sin frameworks ni dependencias externas.

## Documentación

- [docs/architecture.md](docs/architecture.md): componentes y decisiones.
- [docs/setup.md](docs/setup.md): repositorio y GitHub Pages.
- [docs/compatibility.md](docs/compatibility.md): Safari de iOS 12, comprobado y pendiente.
- [docs/security.md](docs/security.md): datos, credenciales y almacenamiento.
- [tests/manual-test-plan.md](tests/manual-test-plan.md): pruebas en el iPad.

## Privacidad

El repositorio es público. No contiene fotografías personales, credenciales ni
tokens. Las fotos de `assets/photos/` son imágenes generadas para pruebas.

## Licencia

MIT. Ver [LICENSE](LICENSE).
