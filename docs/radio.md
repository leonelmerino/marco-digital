# Radio por internet

Sustituye al plan original de música de Internet Archive (decisión del
23-10-2026). La radio es una pista de fondo independiente de las fotos.

## Estaciones

Las 12 más escuchadas de Santiago según la medición de Ipsos de marzo a junio
de 2025 (resumen publicado por Prisa Media), más Agricultura y Beethoven
(14 en total). La lista está en
`assets/js/radio/stations.js`.

| Estación | Frecuencia (Santiago) | Distribuidor de la señal | Formato |
| --- | --- | --- | --- |
| Corazón, Imagina, Activa, Pudahuel, FMDOS, Concierto, Futuro, Rock & Pop, ADN | ver lista | Triton / StreamTheWorld (`playerservices.streamtheworld.com`) | MP3 128 kbps |
| Bío-Bío, Cooperativa, Agricultura | ver lista | DPS (`redirector.dps.live`) | MP3 |
| Beethoven | 96.5 | DPS, servidores tomados de la configuración de su reproductor oficial (beethovenfm.cl/player2). Su redirector AAC responde 404 por HTTPS, así que se usan los servidores directos | AAC (respaldo HLS) |
| Carolina | 99.3 | Mediastream (`mdstrm.com`), ID tomado de la página «Señal en vivo» de carolina.cl | AAC (respaldo HLS) |

Verificación del 23-10-2026:

- Todas las URLs responden por **HTTPS**, también tras sus redirecciones.
  La app se sirve por HTTPS y Safari bloquea el audio HTTP en una página segura.
- Las 14 suenan en un navegador de escritorio en menos de 3 s (Beethoven
  añadida el 23-10-2026).
- En el iPad sonaron Corazón, Futuro, Bío-Bío y Concierto; la radio siguió
  con la pantalla bloqueada y se recuperó sola tras el modo avión.
- **Pendiente:** el resto de estaciones en el iPad.

Cada estación puede tener varias URLs; si una falla se prueba la siguiente.
Después de agotar la lista se reintenta 3 veces (a los 2, 4 y 6 s) y luego se
muestra «No se pudo conectar».

Si una emisora cambia su señal, actualizar la URL en `stations.js` y la fecha
de verificación en este documento.

## Escanear

El botón **Escanear** recorre las estaciones en orden y en bucle infinito
(después de la última vuelve a la primera):

- Si la radio estaba sonando, empieza por la siguiente; si no, por la actual.
- Cada estación suena **5 segundos contados desde que empieza el sonido**, para
  que las que tardan en conectar no se oigan menos.
- Una estación que no suena en 8 s, o que falla, se salta sin reintentos.
- **Cualquier toque** lo detiene y deja sonando la estación actual, que queda
  guardada como elegida: tocar la pantalla, un botón, una estación o «Quedarme
  aquí». Tocar ■ lo detiene y apaga la radio. Cerrar la ventana de radio
  («Listo» o tocar fuera) no lo detiene, para poder volver a las fotos.

## Licencias y uso

- La app solo reproduce la señal pública que cada emisora ofrece en su propio
  reproductor web. No graba, no guarda ni redistribuye audio.
- No se incluyen logotipos de las emisoras (son marcas registradas): se
  muestran el nombre, la frecuencia y el estilo.
- Al escuchar, el iPad se conecta directamente con el distribuidor de cada
  emisora, que ve la dirección IP como con cualquier reproductor de radio.

## Comportamiento en iOS

- **Sin reproducción automática:** la radio empieza solo al tocar una estación
  o ▶. Nunca arranca al cargar la página.
- **Volumen:** Safari de iOS ignora el volumen fijado por la página. En el iPad
  se oculta el control y se usan los botones laterales. En el Mac sí funciona.
- **Detener, no pausar:** al detener se suelta la conexión; al volver a tocar ▶
  se conecta con la señal en directo actual.
- **Interrupciones:** si iOS pausa el audio (llamada, otra app con sonido,
  bloqueo), la app muestra «Toca ▶ para seguir». Hay que comprobar en el iPad si
  el audio sigue con la pantalla bloqueada.
- **Canción en curso:** no se muestra; las señales no la ofrecen de forma
  accesible desde el navegador.
