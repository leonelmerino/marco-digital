/*
 * Biblioteca de fotos de Dropbox, de una o varias carpetas.
 *
 * - La lista de cada carpeta llega por páginas (files/list_folder y
 *   list_folder/continue). Cada página se procesa y se descarta: de cada foto
 *   solo se guarda { name, path }. La presentación empieza con la primera
 *   página, sin esperar a la lista completa.
 * - Con más de MAX_PHOTOS fotos se guarda una muestra aleatoria uniforme
 *   (muestreo de reservorio) para no agotar la memoria del iPad; con varias
 *   carpetas el límite se reparte entre ellas.
 * - Las carpetas se listan una tras otra y se unen sin repetir fotos (una
 *   carpeta puede estar dentro de otra).
 * - Cada REFRESH_MS se piden solo los cambios desde la última vez (cursor).
 * - Las fotos se muestran con la versión reducida que genera Dropbox, nunca
 *   con el archivo original. Junto con cada una se piden su fecha y su
 *   ubicación (get_metadata), una sola vez por foto.
 */
(function (global) {
  'use strict';

  var Frame = global.Frame = global.Frame || {};

  var MAX_PHOTOS = 100000;
  var PAGE_LIMIT = 2000;
  var REFRESH_MS = 30 * 60 * 1000;
  var RETRY_MS = 5 * 60 * 1000;
  var THUMB_TIMEOUT_MS = 30000;
  // Formatos de los que Dropbox genera miniaturas. HEIC/HEIF por verificar.
  var PHOTO_EXT = /\.(jpe?g|png|gif|webp|tiff?|bmp|heic|heif)$/i;

  var gen = 0;             // invalida listados de una configuración anterior
  var sources = [];        // una por carpeta: { folder, photos, seen, cursor, listing }
  var recursive = true;
  var photos = [];         // todas las carpetas juntas, sin repetir
  var refreshTimer = null;
  var onUpdate = function () {};
  var onStatus = function () {};

  function log(text, isError) { Frame.compat.log('Dropbox: ' + text, isError); }

  function isPhoto(name) { return PHOTO_EXT.test(name); }

  function folderLabel(folder) { return folder.name || 'todo Dropbox'; }

  // Con varias carpetas, el límite de memoria se reparte entre ellas.
  function maxPerSource() { return Math.floor(MAX_PHOTOS / Math.max(1, sources.length)); }

  function add(src, entry) {
    var photo = { name: entry.path_display.replace(/^\//, '') || entry.name, path: entry.path_lower };
    var max = maxPerSource();
    src.seen++;
    if (src.photos.length < max) {
      src.photos.push(photo);
    } else {
      var j = Math.floor(Math.random() * src.seen);
      if (j < max) src.photos[j] = photo;
    }
  }

  function removeAll(src, deleted) {
    if (!deleted.length) return;
    var before = src.photos.length;
    src.photos = src.photos.filter(function (p) {
      for (var i = 0; i < deleted.length; i++) {
        if (p.path === deleted[i] || p.path.indexOf(deleted[i] + '/') === 0) return false;
      }
      return true;
    });
    // Con muestra solo se sabe cuántas de la muestra se borraron.
    src.seen = Math.max(src.photos.length, src.seen - (before - src.photos.length));
  }

  function apply(src, entries) {
    var deleted = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e['.tag'] === 'file' && isPhoto(e.name)) add(src, e);
      else if (e['.tag'] === 'deleted') deleted.push(e.path_lower);
    }
    removeAll(src, deleted);
  }

  // Une las carpetas. Si una está dentro de otra, sus fotos no se repiten.
  function merge() {
    var seenPaths = Object.create(null);
    var out = [];
    for (var s = 0; s < sources.length; s++) {
      var list = sources[s].photos;
      for (var i = 0; i < list.length; i++) {
        if (seenPaths[list[i].path]) continue;
        seenPaths[list[i].path] = true;
        out.push(list[i]);
      }
    }
    photos = out;
  }

  function describe(src, err) {
    var s = err.summary || '';
    if (/not_found/.test(s)) return 'La carpeta «' + folderLabel(src.folder) + '» ya no existe en Dropbox. Quítala en Configuración.';
    if (err.status === 401 || /invalid_grant|No conectado/.test(err.code + ' ' + err.message)) {
      return 'Dropbox pide volver a conectar.';
    }
    return 'No se pudo leer Dropbox (' + (s || err.message) + '). Se reintentará.';
  }

  function failed(src, err, my) {
    if (my !== gen) return;
    src.listing = false;
    src.error = describe(src, err);
    log('error al listar «' + folderLabel(src.folder) + '»: ' + (err.summary || err.message), true);
    onStatus(statusText(), true);
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () { if (my === gen) refreshAll(); }, RETRY_MS);
  }

  function statusText() {
    var seen = 0;
    var listing = false;
    var errors = [];
    for (var i = 0; i < sources.length; i++) {
      seen += sources[i].seen;
      listing = listing || sources[i].listing;
      if (sources[i].error) errors.push(sources[i].error);
    }
    var text = photos.length === 1 ? '1 foto' : photos.length + ' fotos';
    if (seen > photos.length && sources.some(function (s) { return s.seen > s.photos.length; })) {
      text = 'muestra de ' + photos.length + ' de ' + seen + ' fotos';
    }
    if (listing) text += ' · buscando más…';
    if (errors.length) text += ' · ' + errors.join(' ');
    return text;
  }

  function anyListing() {
    for (var i = 0; i < sources.length; i++) if (sources[i].listing) return true;
    return false;
  }

  function page(src, result, my) {
    if (my !== gen) return null;
    apply(src, result.entries);
    src.cursor = result.cursor;
    src.error = '';
    merge();
    onUpdate(photos);
    onStatus(statusText(), false);
    if (result.has_more) {
      return Frame.dropboxApi.rpc('files/list_folder/continue', { cursor: src.cursor })
        .then(function (next) { return page(src, next, my); });
    }
    var wasListing = src.listing;
    src.listing = false;
    if (wasListing) log('lista completa de «' + folderLabel(src.folder) + '»: ' + src.photos.length + ' fotos');
    onStatus(statusText(), false);
    if (!anyListing()) {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(function () { if (my === gen) refreshAll(); }, REFRESH_MS);
    }
    return null;
  }

  function fullList(src, my) {
    src.listing = true;
    src.photos = [];
    src.seen = 0;
    src.cursor = null;
    onStatus('Buscando fotos…', false);
    return Frame.dropboxApi.rpc('files/list_folder', {
      path: src.folder.path,
      recursive: recursive,
      limit: PAGE_LIMIT
    }).then(function (result) { return page(src, result, my); })
      .catch(function (err) { failed(src, err, my); });
  }

  // Solo los cambios desde la última lista; si Dropbox anula el cursor, se
  // vuelve a listar la carpeta (la presentación sigue con la lista anterior).
  function refresh(src) {
    var my = gen;
    if (!src.cursor) return fullList(src, my);
    return Frame.dropboxApi.rpc('files/list_folder/continue', { cursor: src.cursor })
      .then(function (result) { return page(src, result, my); })
      .catch(function (err) {
        if (/^reset/.test(err.summary || '')) {
          log('cursor anulado; se vuelve a listar «' + folderLabel(src.folder) + '»');
          var keep = src.photos;
          return fullList(src, my).then(function () {
            if (!src.photos.length) { src.photos = keep; merge(); }
          });
        }
        failed(src, err, my);
      });
  }

  function refreshAll() {
    for (var i = 0; i < sources.length; i++) if (!sources[i].listing) refresh(sources[i]);
  }

  // ---- API pública ----

  function start(folders, includeSubfolders, callbacks) {
    stop();
    recursive = includeSubfolders;
    onUpdate = callbacks.onUpdate;
    onStatus = callbacks.onStatus;
    sources = folders.map(function (f) {
      return { folder: f, photos: [], seen: 0, cursor: null, listing: false, error: '' };
    });
    log(folders.map(function (f) { return '«' + folderLabel(f) + '»'; }).join(', ') +
      (recursive ? ' con subcarpetas' : ''));
    // Una carpeta tras otra: la primera foto sale con la primera página.
    var my = gen;
    sources.reduce(function (chain, src) {
      return chain.then(function () { if (my === gen) return fullList(src, my); });
    }, Promise.resolve());
  }

  function stop() {
    gen++;
    clearTimeout(refreshTimer);
    sources = [];
    photos = [];
    blobCache = [];
  }

  // Fecha y lugar de la foto, del índice (photo-index.js) o de Dropbox. Un
  // fallo aquí nunca impide mostrar la foto.
  function fetchInfo(photo) {
    if (photo.info && !photo.info.pending) return Promise.resolve();
    return Frame.photoIndex.lookup(photo).then(function (rec) {
      photo.info = rec;
    }, function (err) {
      log('datos de ' + photo.name + ': ' + (err.summary || err.message), true);
    });
  }

  // Últimas miniaturas descargadas (~300 KB cada una): volver atrás con el
  // gesto no las pide de nuevo a Dropbox.
  var BLOB_CACHE_MAX = 10;
  var blobCache = [];      // [{ key, blob }], la más reciente al final

  function cachedBlob(key) {
    for (var i = 0; i < blobCache.length; i++) {
      if (blobCache[i].key !== key) continue;
      var hit = blobCache.splice(i, 1)[0];
      blobCache.push(hit);
      return hit.blob;
    }
    return null;
  }

  function keepBlob(key, blob) {
    blobCache.push({ key: key, blob: blob });
    if (blobCache.length > BLOB_CACHE_MAX) blobCache.shift();
  }

  function thumbnail(photo, small) {
    var key = photo.path + (small ? '#s' : '');
    var blob = cachedBlob(key);
    if (blob) return Promise.resolve(blob);
    return Frame.dropboxApi.thumbnail(photo.path, small).then(function (fresh) {
      keepBlob(key, fresh);
      return fresh;
    });
  }

  // Cargador para la presentación: devuelve una URL blob: de la miniatura
  // (más pequeña con `small`).
  function load(photo, callback, small) {
    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      callback(new Error('tiempo agotado'));
    }, THUMB_TIMEOUT_MS);
    Promise.all([
      thumbnail(photo, small),
      fetchInfo(photo)
    ]).then(function (results) {
      var blob = results[0];
      if (done) return;
      done = true;
      clearTimeout(timer);
      callback(null, global.URL.createObjectURL(blob));
    }, function (err) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      log('miniatura de ' + photo.name + ': ' + (err.summary || err.message), true);
      callback(err);
    });
  }

  // Para el explorador de carpetas: subcarpetas y número de fotos en `path`.
  function browse(path) {
    var folders = [];
    var count = 0;
    function collect(result) {
      for (var i = 0; i < result.entries.length; i++) {
        var e = result.entries[i];
        if (e['.tag'] === 'folder') folders.push({ name: e.name, path: e.path_lower, display: e.path_display });
        else if (e['.tag'] === 'file' && isPhoto(e.name)) count++;
      }
      if (result.has_more) {
        return Frame.dropboxApi.rpc('files/list_folder/continue', { cursor: result.cursor }).then(collect);
      }
      folders.sort(function (a, b) { return a.name.localeCompare(b.name); });
      return { folders: folders, photoCount: count };
    }
    return Frame.dropboxApi.rpc('files/list_folder', { path: path, recursive: false, limit: PAGE_LIMIT })
      .then(collect);
  }

  Frame.dropboxLibrary = {
    start: start,
    stop: stop,
    refresh: function () { if (sources.length) refreshAll(); },
    load: load,
    browse: browse,
    photos: function () { return photos; }
  };
})(window);
