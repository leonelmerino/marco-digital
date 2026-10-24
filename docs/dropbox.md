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
- **Pendiente:** inicio de sesión real, carpeta real, HEIC, iPad.
