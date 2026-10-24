# Repositorio y GitHub Pages

## Cómo está publicado

- Repositorio: `leonelmerino/marco-digital` (público).
- GitHub Pages: rama `main`, carpeta raíz `/`.
- URL: https://leonelmerino.github.io/marco-digital/

Al ser un repositorio de proyecto, GitHub lo sirve como subcarpeta del sitio
`leonelmerino.github.io` sin modificar el repositorio de ese sitio.
El archivo `.nojekyll` desactiva Jekyll: los archivos se publican tal cual y
los `.md` de `docs/` no se convierten en páginas.

Todas las rutas del HTML son relativas (`assets/...`), por lo que la app
funciona igual en `localhost` y bajo `/marco-digital/`.

## Repetir la configuración desde cero

1. Crear el repositorio y subir la rama `main`.
2. En GitHub: **Settings › Pages › Build and deployment › Source: Deploy from
   a branch**, rama `main`, carpeta `/ (root)`.
3. Esperar a que termine la publicación (pestaña **Actions**) y abrir la URL.

Con la CLI de GitHub:

```sh
gh api -X POST repos/<usuario>/marco-digital/pages -f "source[branch]=main" -f "source[path]=/"
```

## Fase 3

La aplicación de Dropbox y sus direcciones de retorno se describen en
[dropbox.md](dropbox.md). Si se publica en otra dirección, hay que añadirla
como *Redirect URI* en la consola de Dropbox.
