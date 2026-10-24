# Compatibilidad con Safari de iOS 12.5.8

iOS 12.5.8 incluye Safari 12.1. Esta tabla distingue lo **comprobado en el
iPad** de lo que solo se ha supuesto a partir de la documentación. Actualizarla
con cada prueba en el dispositivo.

## Decisiones tomadas por compatibilidad

| Tema | Decisión |
| --- | --- |
| Sintaxis JS | ES2017 en scripts clásicos. Sin `?.`, `??` (Safari 13.1+) ni `Object.fromEntries` (12.1, sin margen). |
| Módulos ES | No se usan, para evitar diferencias de carga y caché. |
| Flexbox `gap` | No se usa (Safari 14.1+). Se usan márgenes. |
| `100vh` | No se usa: incluye la barra de Safari. Se usa `position: fixed` con `top/bottom: 0`. |
| `click` en un `div` | iOS 12 solo lo dispara si el elemento tiene `cursor: pointer`. El escenario lo tiene. |
| Zoom con doble toque | `touch-action: manipulation` en el escenario. |
| Fullscreen API | No se usa: su soporte en el iPad con iOS 12 es limitado y no está comprobado. La app funciona en una pestaña normal. |
| `translateZ(0)` en las capas | Retirado: gasta memoria de GPU y en pruebas dejaba las capturas en negro. |
| Service workers | No se usan hasta comprobarlos en el iPad (requisito de la especificación). |
| Fechas | Nombres de días y meses en español escritos a mano, sin depender de `Intl`. |
| Audio automático | No se usa: `play()` solo se llama dentro de un toque. |
| Volumen del audio | iOS ignora `audio.volume`; el control se oculta en iOS. |
| Audio HTTP | No se usa: Safari lo bloquea en una página HTTPS. Todas las radios usan HTTPS. |

## Estado de las pruebas en el iPad

| Capacidad | Comprobado en el iPad | Resultado |
| --- | --- | --- |
| Carga de la página y scripts sin errores | Sí (23-10-2026) | Sin errores. Safari 12.1.2 |
| `object-fit` en `<img>` | Sí (23-10-2026) | Detectado y visualmente correcto |
| Transición de `opacity` | Sí (23-10-2026) | Fundido correcto |
| `localStorage` en pestaña normal | Sí (23-10-2026) | |
| `localStorage` desde la pantalla de inicio | Pendiente | |
| `visibilitychange` al bloquear y desbloquear | Sí (23-10-2026) | Bloqueo de ~3 min; hora correcta al volver |
| `crypto.subtle` (necesario para PKCE en la fase 3) | Detectado (23-10-2026) | `digest('SHA-256')` se prueba al conectar Dropbox |
| Dropbox: inicio de sesión y vuelta al marco | Pendiente | En pestaña de Safari y desde la pantalla de inicio |
| Dropbox: miniaturas con `fetch` + `blob:` | Pendiente | |
| Cambio de orientación | Sí (23-10-2026) | |
| Radio: estaciones suenan | En parte (24-10-2026) | Además: Imagina, Activa, Pudahuel, Carolina, Cooperativa, FMDOS (al escanear); faltan Rock & Pop, ADN, Agricultura y Beethoven |
| Radio con la pantalla bloqueada | Sí (23-10-2026) | Siguió sonando |
| Radio: reconexión tras modo avión | Sí (23-10-2026) | Se cortó a los ~8 s y volvió sola al recuperar la red |
| Radio: `play()` sin toque al escanear | Sí (24-10-2026) | Cambia de estación sola cada 5 s |
| Radio: dos `<audio>` a la vez (uno silenciado) | Sí (24-10-2026) | Escaneo sin silencios; `muted` funciona en iOS 12 |
| Funcionamiento continuo durante varias horas | Pendiente | |

El panel de diagnóstico (Configuración › Estado y diagnóstico) muestra la
versión de iOS y las capacidades detectadas para rellenar esta tabla.

## Limitaciones conocidas

- La app no puede impedir que el iPad se bloquee: hay que configurar
  **Bloqueo automático › Nunca**.
- La orientación no se puede fijar desde una página web; el diseño se adapta.
- Con la página en segundo plano o la pantalla bloqueada, iOS congela los
  temporizadores; la app se pone al día al volver.
