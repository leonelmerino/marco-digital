# Arquitectura

Aplicación estática: HTML, CSS y JavaScript nativo servidos por GitHub Pages.
No hay backend, compilación ni dependencias.

## Componentes

Cada archivo es un IIFE que añade un módulo al espacio de nombres global
`window.Frame`. El orden de carga en `index.html` define las dependencias.

| Archivo | Módulo | Responsabilidad |
| --- | --- | --- |
| `compatibility.js` | `Frame.compat` | Captura de errores, detección de capacidades, panel de diagnóstico. Se carga primero. |
| `storage.js` | `Frame.storage` | `localStorage` con `try/catch` y respaldo en memoria. |
| `settings.js` | `Frame.settings` | Valores por defecto, validación contra listas cerradas, formulario. |
| `clock.js` | `Frame.clock` | Hora y fecha locales. |
| `slideshow.js` | `Frame.slideshow` | Orden, temporizador, carga, fundido, precarga y leyenda de cada capa. |
| `geo.js` | `Frame.geo` | Ciudad y país a partir de coordenadas, sin conexión. Carga `data/cities.js` tras el arranque. |
| `photo-info.js` | `Frame.photoInfo` | Texto de la leyenda: lugar y «12 de marzo de 2016 · hace 8 años». |
| `data/cities.js` | `Frame.cityData` | Tabla generada (GeoNames + Natural Earth, ~1,4 MB; ~650 KB comprimida). No se edita a mano. |
| `sample-photos.js` | `Frame.samplePhotos` | Fotos de prueba, cuando no hay Dropbox conectado. |
| `radio/stations.js` | `Frame.radioStations` | Estaciones predefinidas y sus URLs. Se carga antes de `settings.js`. |
| `radio/radio-player.js` | `Frame.radio` | Dos `<audio>`: conectar, reintentar, URLs de respaldo, escaneo sin silencios, estados. |
| `vendor/qrcode.js` | `qrcode` | Biblioteca externa (MIT) para dibujar el QR de inicio de sesión. |
| `dropbox/config.js` | `Frame.dropboxConfig` | App key pública. |
| `dropbox/auth.js` | `Frame.dropboxAuth` | OAuth 2.0 + PKCE, renovación del token, carpeta elegida. |
| `dropbox/api.js` | `Frame.dropboxApi` | Llamadas a la API (JSON) y miniaturas (Blob), con renovación y espera. |
| `dropbox/photo-index.js` | `Frame.photoIndex` | Fecha y país de cada foto, en segundo plano (~3 por segundo), guardados en IndexedDB. |
| `photo-filter.js` | `Frame.photoFilter` | Filtro por país y rango de años; cifras para el panel. |
| `filter-ui.js` | `Frame.filterUI` | Panel «Filtrar fotos»: países, barras por año y deslizador doble táctil. |
| `dropbox/library.js` | `Frame.dropboxLibrary` | Lista por páginas, muestreo, cambios cada 30 min, cargador de miniaturas con fecha y ubicación, explorador. |
| `app.js` | — | Arranque, controles, configuración, radio, conectividad, ciclo de vida. |

Ver [dropbox.md](dropbox.md) para el flujo de Dropbox y las carpetas grandes.
La radio sustituye a la carpeta `music/` prevista en la especificación (ver `docs/radio.md`).

## Decisiones

**Reloj.** Cada tic lee `new Date()` y programa el siguiente justo después del
cambio de segundo. Los temporizadores solo despiertan; nunca miden el tiempo.
Al volver a primer plano (`visibilitychange`, `pageshow`) se repinta al instante.

**Presentación con dos capas.** Hay dos capas fijas: la visible y la oculta.
Para cambiar de vista se prepara la siguiente en la capa oculta y se
intercambian las clases; el fundido es una transición CSS de `opacity`. Tras
el fundido, la capa oculta prepara la vista siguiente. No se crea un objeto
`Image` por foto: cada capa tiene tres `<img>` fijos, así que como mucho hay
seis imágenes decodificadas (las que acompañan a una vertical, a 1024×768).

**Vistas de varias fotos.** Una foto que no llena la pantalla en su
orientación (vertical con el iPad horizontal) se junta con la siguiente
vertical, una al lado de la otra, o con las dos horizontales siguientes
apiladas a su lado. Si tras la vertical viene una horizontal y luego otra
vertical, se juntan las dos verticales y la horizontal pasa a la vista
siguiente (se intercambian en el orden). La orientación se lee de la
miniatura ya cargada, así que la vista se arma foto a foto: la primera a
tamaño completo y, solo si es vertical, las siguientes en pequeño. Al girar el
iPad las celdas se recolocan (en vertical, dos horizontales van una sobre la
otra). Se desactiva en Configuración › Agrupar fotos verticales.

**Un solo temporizador.** `slideshow.js` guarda un único `timer` y lo limpia
antes de crear otro. El temporizador arranca cuando la vista ya está visible,
así una descarga lenta no acorta el tiempo de exhibición. Una vista de dos o
tres fotos dura lo mismo que una foto sola.

**Errores de imagen.** Si una foto falla, se registra y se pasa a la siguiente
tras 400 ms. Si fallan todas, se muestra un aviso y se reintenta en el
siguiente intervalo. Un contador de secuencia (`seq`) descarta cargas obsoletas
cuando el usuario avanza o retrocede mientras otra descarga sigue en curso.

**Orden.** Aleatorio por ciclos (Fisher-Yates): cada ciclo muestra todas las
fotos una vez, y al empalmar dos ciclos se evita repetir la misma foto. El
historial se recorta para que la lista no crezca sin límite.

**Segundo plano.** Al ocultarse la página se cancelan los temporizadores; al
volver, se calcula cuánto tiempo pasó y se cambia de foto si ya tocaba.

**Preferencias.** Se validan contra listas cerradas al leerlas, de modo que un
valor dañado o antiguo vuelve al valor por defecto en lugar de romper la app.

**Versiones en caché.** `index.html` pide cada archivo con `?v=N`. Al publicar
cambios hay que subir N en todas las líneas: así el iPad nunca mezcla un
archivo nuevo con otro guardado en caché (GitHub Pages permite guardarlos 10
minutos).

**Pantalla completa.** No se usa la Fullscreen API. El escenario usa
`position: fixed` con `top/right/bottom/left: 0` en vez de `100vh`, que en
Safari de iOS incluye la barra de herramientas. Las etiquetas
`apple-mobile-web-app-*` permiten abrirla sin barras desde la pantalla de inicio.
