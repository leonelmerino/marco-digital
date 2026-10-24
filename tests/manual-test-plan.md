# Plan de pruebas manuales — Fases 1, 2 y 4

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
| 7 | Aleatorio sin repetición inmediata | Intervalo de 10 s; observar 10 cambios | Nunca la misma foto dos veces seguidas | |
| 8 | Orden por nombre | Orden › Cronológico | foto-01 → 02 → 03 → 04 → 05 → 01 | |
| 9 | Tamaños distintos | Recorrer las 5 fotos (horizontal, vertical, 4032×3024, pequeña, PNG) | Todas se ven completas y nítidas; la grande no tarda en exceso | |
| 10 | Ajuste «Llenar la pantalla» | Ajuste de la foto › Llenar | Sin bordes negros; la foto vertical se recorta | |
| 11 | Controles | Tocar la pantalla; esperar 5 s | Aparecen y se ocultan solos; un segundo toque los oculta | |
| 12 | Pausa de fotos | Tocar «❚❚ Fotos», esperar 2 intervalos y tocar «▶ Fotos» | El botón cambia de icono y color; no cambia en pausa; continúa al reanudar | |
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
| 25 | Radio: abrir | Tocar la pantalla › ♪ Estaciones | Lista de 14 estaciones; dice «Apagada»; no suena nada | |
| 26 | Radio: escuchar | Tocar una estación | Suena en pocos segundos; dice «Sonando» | |
| 27 | Radio: todas | Tocar cada estación una por una | Las 14 suenan (anotar las que no) | |
| 28 | Radio: detener | Tocar ■ | Se detiene; desaparece el aviso de la radio en los controles | |
| 29 | Radio: volumen | Botones de volumen del iPad | Cambia el volumen; la app no muestra control de volumen | |
| 30 | Radio y bloqueo | Con la radio sonando, bloquear 1 min y desbloquear | Anotar si siguió sonando o pide «Toca ▶» | |
| 31 | Radio sin conexión | Con la radio sonando, activar modo avión 20 s | Pasa a «Reconectando…» y luego a error; al quitar el modo avión, tocar ▶ vuelve a sonar | |
| 33 | Escanear | ♪ Estaciones › Escanear | Cambia de estación cada ~5 s de sonido, sin tocar nada y **sin silencio entre estaciones**; tras Beethoven vuelve a Corazón | |
| 34 | Escanear y quedarse | Durante el escaneo, tocar la foto | Se queda en la estación que sonaba; al abrir ♪ Estaciones está marcada | |
| 35 | Escanear con Listo | Escanear y tocar Listo | Vuelve a las fotos y sigue escaneando | |
| 32 | Radio tras recargar | Recargar la página | No suena sola; recuerda la última estación elegida | |
| 37 | Dropbox: conectar con el teléfono | Configuración › Conectar con el teléfono (QR); escanear con el iPhone; iniciar sesión y permitir; escribir el código en el iPad | Se abre «Elegir carpeta» | |
| 38 | Dropbox: elegir carpeta | Navegar hasta la carpeta de fotos › Usar esta carpeta | Aparecen fotos de esa carpeta; Configuración muestra el número de fotos | |
| 39 | Dropbox: carpeta grande | Usar la carpeta de 10 años | La primera foto sale en pocos segundos; el número sube hasta el total; anotar cuánto tarda la lista completa | |
| 40 | Dropbox: HEIC | Incluir fotos .heic del iPhone | Anotar si se ven o si el diagnóstico muestra fallos de miniatura | |
| 41 | Dropbox: foto nueva | Subir una foto a la carpeta; tocar «Buscar fotos nuevas» | El número aumenta en 1 | |
| 42 | Dropbox: recarga | Recargar la página | Sigue conectado y vuelve a listar la carpeta sin pedir nada | |
| 43 | Dropbox: desconectar | Desconectar | Vuelven las fotos de prueba; en dropbox.com ya no aparece como aplicación conectada | |
| 44 | Dropbox: pantalla de inicio | Abrir desde el icono de la pantalla de inicio | Anotar si pide conectar de nuevo y si el inicio de sesión vuelve al marco | |
| 36 | Radio desde los controles | Tocar «▶ Radio» y luego «❚❚ Radio» | Suena la estación elegida; el botón se pone azul; al pausar se detiene | |

## Cómo registrar un fallo

Indica: número de caso, versión de iOS, pestaña normal o pantalla de inicio,
pasos exactos, qué ocurrió y el texto rojo del panel de diagnóstico (una foto
de la pantalla sirve).

## Criterio de salida de la fase 1

Casos 1–22, 24 y 25–35 correctos en el iPad, sin errores en el diagnóstico. El caso 23
es informativo para la fase 3.
