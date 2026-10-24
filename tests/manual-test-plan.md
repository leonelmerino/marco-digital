# Plan de pruebas manuales — Fase 1 y 2

Dispositivo: **iPad Air A1474, iOS 12.5.8, Safari**. No sustituir por el
simulador ni por Chrome.

## Preparación

1. Activa el **panel de diagnóstico**: toca la pantalla › Configuración ›
   Estado y diagnóstico › Panel de diagnóstico. Muestra errores en rojo.
2. Anota la línea de resumen que aparece en Configuración (versión de iOS,
   capacidades detectadas). Sirve para `docs/compatibility.md`.
3. Para pruebas largas, pon **Bloqueo automático › Nunca** y conecta el
   cargador.

URL publicada: https://leonelmerino.github.io/marco-digital/
URL local (misma Wi-Fi que el Mac): `http://<IP-del-Mac>:8010`

## Casos

| # | Prueba | Pasos | Resultado esperado | Resultado |
| --- | --- | --- | --- | --- |
| 1 | Carga inicial | Abrir la URL publicada | Aparece una foto y el reloj; ningún error rojo en el diagnóstico | |
| 2 | Hora correcta | Comparar con el reloj del iPad | Misma hora y minuto | |
| 3 | Cambio de minuto | Observar un cambio de minuto | El reloj cambia en menos de 2 s | |
| 4 | Varias fotos | Esperar 3 intervalos (30 s c/u) | Cambia la foto cada ~30 s | |
| 5 | Fundido | Observar un cambio | Transición suave, sin parpadeo negro largo | |
| 6 | Corte directo | Configuración › Transición › Corte directo | Cambio instantáneo | |
| 7 | Aleatorio sin repetición inmediata | Pulsar «siguiente» 10 veces | Nunca la misma foto dos veces seguidas | |
| 8 | Orden por nombre | Orden › Cronológico | foto-01 → 02 → 03 → 04 → 05 → 01 | |
| 9 | Tamaños distintos | Recorrer las 5 fotos (horizontal, vertical, 4032×3024, pequeña, PNG) | Todas se ven completas y nítidas; la grande no tarda en exceso | |
| 10 | Ajuste «Llenar la pantalla» | Ajuste de la foto › Llenar | Sin bordes negros; la foto vertical se recorta | |
| 11 | Controles | Tocar la pantalla; esperar 5 s | Aparecen y se ocultan solos; un segundo toque los oculta | |
| 12 | Pausa | Pausar y esperar 2 intervalos; reanudar | No cambia en pausa; continúa al reanudar | |
| 13 | Reloj: formato, tamaño, posición, fecha | Cambiar cada opción | Se aplica al instante | |
| 14 | Modo nocturno | Modo visual › Nocturno | Foto atenuada, reloj legible | |
| 15 | Persistencia | Cambiar opciones, cerrar la pestaña, volver a abrir | Se conservan | |
| 16 | Pérdida de preferencias | Ajustes › Safari › Borrar historial y datos; reabrir | Valores por defecto, sin errores | |
| 17 | Foto rota | Abrir con `?prueba=error` y avanzar varias veces | Se registra el error y la presentación sigue | |
| 18 | Carpeta vacía | Abrir con `?prueba=vacio` | Mensaje «No hay fotografías», reloj visible | |
| 19 | Bloqueo y desbloqueo | Bloquear el iPad 2 min y desbloquear | Hora correcta al instante; la presentación continúa | |
| 20 | Cambio de app | Ir a otra app 2 min y volver | Igual que el caso 19 | |
| 21 | Rotación | Girar a vertical y volver a horizontal | Se adapta; reloj y controles bien colocados | |
| 22 | Sin conexión | Activar modo avión | Aparece «Sin conexión»; reloj y fotos ya cargadas siguen | |
| 23 | Pantalla de inicio | Compartir › Añadir a pantalla de inicio; abrir desde el icono | Sin barras de Safari; anotar si conserva las preferencias de la pestaña | |
| 24 | Uso prolongado | Dejarla abierta 4 h o más con intervalo de 10 s | Sigue cambiando fotos y la hora es correcta; el diagnóstico muestra «Sigue activa: N min» cada 15 min | |

## Cómo registrar un fallo

Indica: número de caso, versión de iOS, pestaña normal o pantalla de inicio,
pasos exactos, qué ocurrió y el texto rojo del panel de diagnóstico (una foto
de la pantalla sirve).

## Criterio de salida de la fase 1

Casos 1–22 y 24 correctos en el iPad, sin errores en el diagnóstico. El caso 23
es informativo para la fase 3.
