# Fotos desde Dropbox (fase 3)

## Cómo funciona

1. **Configuración › Dropbox › Conectar con Dropbox** lleva a dropbox.com.
   Se inicia sesión allí (el marco nunca ve la contraseña) y Dropbox vuelve al
   marco con un código de un solo uso.
2. El marco cambia el código por un **token de acceso** (4 horas, solo en
   memoria) y un **token de renovación** (guardado en `localStorage`), con
   OAuth 2.0 + PKCE. No hay secreto de aplicación en el código.
3. **Elegir carpeta** abre un explorador de carpetas. La carpeta elegida se
   guarda y se lista con sus subcarpetas (se puede desactivar).
4. Cada foto se pide como **miniatura de 2048×1536** (`files/get_thumbnail_v2`,
   JPEG, modo `bestfit`): unos 300 KB aunque el original pese 10 MB. Nunca se
   descarga el archivo original.

### Conectar con el teléfono (iPad con Safari 12)

La página de inicio de sesión de Dropbox exige un navegador más nuevo que
Safari 12 («actualiza tu navegador»). En ese caso el marco oculta «Conectar con
Dropbox» y ofrece **Conectar con el teléfono (QR)**:

1. El iPad genera el verificador PKCE, lo guarda (30 min) y muestra como QR una
   dirección de autorización **sin** `redirect_uri`.
2. En el teléfono se abre esa dirección, se inicia sesión y se toca Permitir.
   Al no haber dirección de retorno, Dropbox muestra un código de un solo uso.
3. Se escribe el código en el iPad, que lo cambia por los tokens usando el
   verificador. El código no sirve en ningún otro aparato.

No necesita una dirección de retorno registrada, así que también funciona
desde la red local (`http://192.168.x.x:8010`). El QR lo dibuja
`assets/js/vendor/qrcode.js` (qrcode-generator 1.4.4, MIT, copia sin
modificar del paquete de npm con su integridad verificada).

## Carpetas grandes

- La lista llega en páginas de 2000 entradas. Cada página se procesa y se
  descarta; de cada foto solo se guarda el nombre y la ruta. La presentación
  empieza con la primera página.
- Con más de **100 000 fotos** se guarda una muestra aleatoria uniforme
  (muestreo de reservorio). En Configuración se ve «muestra de N de M fotos».
- Cada **30 minutos** (o con «Buscar fotos nuevas») se piden solo los cambios
  desde la última vez (`list_folder/continue` con el cursor). Las fotos nuevas
  entran en el orden aleatorio y las borradas desaparecen.
- La lista no se guarda en el iPad: al recargar la página se vuelve a pedir.
- Datos: unos 35 MB por hora con una foto cada 30 s.

Se muestran los archivos `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.tif`,
`.tiff`, `.bmp`, `.heic` y `.heif`. La documentación de Dropbox no cita HEIC
entre los formatos con miniatura: **está por verificar**. Si falla, la foto se
salta y queda anotado en el diagnóstico.

## Crear la aplicación en Dropbox (ya hecho)

En https://www.dropbox.com/developers/apps:

- Acceso limitado (*Scoped access*), **Acceso a todo Dropbox**. Nombre:
  «Marco digital Leonel».
- Permisos: `files.metadata.read` y `files.content.read`.
- Direcciones de retorno (*Redirect URIs*):
  `https://leonelmerino.github.io/marco-digital/` y `http://localhost:8010/`.
- Clientes públicos (Implicit Grant & PKCE): permitidos.
- La **App key** está en `assets/js/dropbox/config.js`. No es secreta. El
  **App secret** y los tokens generados en la consola nunca van al repositorio.

Dropbox solo acepta direcciones de retorno `https` o `http://localhost`, así
que desde la red local (`http://192.168.x.x:8010`) no se puede conectar: hay
que usar la dirección publicada. Cada dirección (Pages, localhost) guarda su
propia conexión.

## Lugar y fecha de cada foto

Abajo a la izquierda (a la derecha si el reloj está abajo a la izquierda) se
ve, en pequeño:

    Santiago, Chile
    12 de marzo de 2016 · hace 10 años

- Junto con la miniatura se pide `files/get_metadata` con
  `include_media_info: true`: fecha de la toma (`time_taken`), coordenadas
  GPS y medidas. Es una llamada por foto, solo la primera vez que se muestra.
  La lista de la carpeta ya no trae estos datos (Dropbox lo retiró en 2019).
- Sin fecha de la toma se usa la fecha del archivo (`client_modified`). Sin
  GPS (escaneos, fotos recibidas por WhatsApp) solo se ve la fecha.
- La fecha se muestra tal como viene, sin convertir zonas horarias.
- Si Dropbox aún está preparando los datos (`pending`), se vuelven a pedir la
  próxima vez que salga la foto. Un fallo nunca impide mostrar la foto.
- **Ciudad y país sin conexión** (`geo.js`): país por las fronteras de Natural
  Earth (simplificadas a ~2 km); ciudad entre las de más de 15 000 habitantes
  de GeoNames. Cada ciudad abarca un radio según su población (4 km a 27 km),
  así Las Condes o Puente Alto salen como «Santiago»; fuera de todo radio vale
  la más cercana a menos de 40 km, siempre del mismo país. Más lejos (Torres
  del Paine, la cordillera) solo se ve el país. Las coordenadas no salen del iPad.
- Se desactiva en Configuración › Presentación › Mostrar lugar y fecha. Las
  fotos de prueba no tienen estos datos.

Para regenerar la tabla (por ejemplo, para cambiar un nombre en
`OVERRIDES`): descargar `cities15000.zip` y `alternateNamesV2.zip` de
https://download.geonames.org/export/dump/ y
`geojson/ne_50m_admin_0_countries.geojson` de
https://github.com/nvkelso/natural-earth-vector (v5.1.2), y ejecutar
`node tools/build-cities.js <carpeta-geonames> <archivo-geojson>`. Después,
subir `?v=` de `DATA_URL` en `geo.js`.

## Errores

| Situación | Qué hace el marco |
| --- | --- |
| Se anula el permiso (desde Dropbox o con un token inválido) | Vuelve a las fotos de prueba y muestra «Dropbox pidió volver a conectar» |
| La carpeta se borró o se movió | «La carpeta ya no existe en Dropbox. Elige otra.» |
| Sin red o Dropbox no responde | Sigue con las fotos ya listadas; reintenta la lista a los 5 min |
| Una miniatura falla o tarda más de 30 s | Se salta esa foto |
| Dropbox pide esperar (429) | Espera lo indicado (máximo 60 s) y repite |

## Verificación del 24-10-2026

- Con Dropbox simulado en el navegador: explorador de carpetas (con páginas y
  nombres con tildes), lista de 4500 fotos en 3 páginas, primera foto antes de
  terminar la lista, videos ignorados, cambios (una foto nueva y una carpeta
  borrada), las URLs `blob:` se liberan (nunca más de dos vivas).
- Con Dropbox real: la página de autorización acepta la App key y la dirección
  `http://localhost:8010/` («link with Marco digital Leonel»); un token de
  renovación inválido se rechaza y el marco vuelve a las fotos de prueba.
- QR: se lee correctamente (comprobado con el lector de códigos de Chrome) y
  Dropbox acepta la dirección sin retorno; un código inventado se rechaza con
  un mensaje claro.
- En el iPad (24-10-2026): conexión con el QR y la carpeta «Camera Uploads»
  real, 41 246 fotos listadas en unos 70 s.
- Lugar y fecha, con Dropbox simulado: Las Condes → «Santiago, Chile»,
  Versalles → «París, Francia», Brooklyn → «Nueva York, Estados Unidos»,
  Torres del Paine → «Chile» (la ciudad más cercana está en Argentina), punto
  en el mar → nada, foto sin datos → solo la fecha del archivo. 40 000
  búsquedas de ciudad en 0,15 s en el Mac.
- **Pendiente:** HEIC, lugar y fecha en el iPad.
