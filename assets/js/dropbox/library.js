/*
 * Biblioteca de fotos de Dropbox.
 *
 * - La lista de la carpeta llega por páginas (files/list_folder y
 *   list_folder/continue). Cada página se procesa y se descarta: de cada foto
 *   solo se guarda { name, path }. La presentación empieza con la primera
 *   página, sin esperar a la lista completa.
 * - Con más de MAX_PHOTOS fotos se guarda una muestra aleatoria uniforme
 *   (muestreo de reservorio) para no agotar la memoria del iPad.
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

  var gen = 0;             // invalida listados de una carpeta anterior
  var folder = null;       // { path, name }
  var recursive = true;
  var photos = [];
  var seen = 0;            // fotos vistas en total (para el muestreo)
  var cursor = null;
  var listing = false;
  var refreshTimer = null;
  var onUpdate = function () {};
  var onStatus = function () {};

  function log(text, isError) { Frame.compat.log('Dropbox: ' + text, isError); }

  function isPhoto(name) { return PHOTO_EXT.test(name); }

  function relativeName(entry) {
    var prefix = folder.path ? folder.name.length + 1 : 1;
    return entry.path_display.slice(prefix) || entry.name;
  }

  function add(entry) {
    var photo = { name: relativeName(entry), path: entry.path_lower };
    seen++;
    if (photos.length < MAX_PHOTOS) {
      photos.push(photo);
    } else {
      var j = Math.floor(Math.random() * seen);
      if (j < MAX_PHOTOS) photos[j] = photo;
    }
  }

  function removeAll(deleted) {
    if (!deleted.length) return;
    var before = photos.length;
    photos = photos.filter(function (p) {
      for (var i = 0; i < deleted.length; i++) {
        if (p.path === deleted[i] || p.path.indexOf(deleted[i] + '/') === 0) return false;
      }
      return true;
    });
    // Con muestra solo se sabe cuántas de la muestra se borraron.
    seen = Math.max(photos.length, seen - (before - photos.length));
  }

  function apply(entries) {
    var deleted = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e['.tag'] === 'file' && isPhoto(e.name)) add(e);
      else if (e['.tag'] === 'deleted') deleted.push(e.path_lower);
    }
    removeAll(deleted);
  }

  function describe(err) {
    var s = err.summary || '';
    if (/not_found/.test(s)) return 'La carpeta ya no existe en Dropbox. Elige otra.';
    if (err.status === 401 || /invalid_grant|No conectado/.test(err.code + ' ' + err.message)) {
      return 'Dropbox pide volver a conectar.';
    }
    return 'No se pudo leer Dropbox (' + (s || err.message) + '). Se reintentará.';
  }

  function failed(err, my) {
    if (my !== gen) return;
    listing = false;
    log('error al listar: ' + (err.summary || err.message), true);
    onStatus(describe(err), true);
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () { if (my === gen) refresh(); }, RETRY_MS);
  }

  function statusText() {
    var text = photos.length === 1 ? '1 foto' : photos.length + ' fotos';
    if (seen > photos.length) text = 'muestra de ' + photos.length + ' de ' + seen + ' fotos';
    return text + (listing ? ' · buscando más…' : '');
  }

  function page(result, my) {
    if (my !== gen) return null;
    apply(result.entries);
    cursor = result.cursor;
    onUpdate(photos);
    onStatus(statusText(), false);
    if (result.has_more) {
      return Frame.dropboxApi.rpc('files/list_folder/continue', { cursor: cursor })
        .then(function (next) { return page(next, my); });
    }
    var wasListing = listing;
    listing = false;
    if (wasListing) log('lista completa: ' + statusText());
    onStatus(statusText(), false);
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () { if (my === gen) refresh(); }, REFRESH_MS);
    return null;
  }

  function fullList(my) {
    listing = true;
    photos = [];
    seen = 0;
    cursor = null;
    onStatus('Buscando fotos…', false);
    return Frame.dropboxApi.rpc('files/list_folder', {
      path: folder.path,
      recursive: recursive,
      limit: PAGE_LIMIT
    }).then(function (result) { return page(result, my); })
      .catch(function (err) { failed(err, my); });
  }

  // Solo los cambios desde la última lista; si Dropbox anula el cursor, se
  // vuelve a listar todo (la presentación sigue con la lista anterior).
  function refresh() {
    var my = gen;
    if (!cursor) return fullList(my);
    return Frame.dropboxApi.rpc('files/list_folder/continue', { cursor: cursor })
      .then(function (result) { return page(result, my); })
      .catch(function (err) {
        if (/^reset/.test(err.summary || '')) {
          log('cursor anulado; se vuelve a listar la carpeta');
          var keep = photos;
          return fullList(my).then(function () { if (!photos.length) photos = keep; });
        }
        failed(err, my);
      });
  }

  // ---- API pública ----

  function start(newFolder, includeSubfolders, callbacks) {
    stop();
    folder = newFolder;
    recursive = includeSubfolders;
    onUpdate = callbacks.onUpdate;
    onStatus = callbacks.onStatus;
    log('carpeta «' + (folder.name || '/') + '»' + (recursive ? ' con subcarpetas' : ''));
    fullList(gen);
  }

  function stop() {
    gen++;
    clearTimeout(refreshTimer);
    listing = false;
    photos = [];
    seen = 0;
    cursor = null;
  }

  // Fecha y lugar de la foto (files/get_metadata con include_media_info; la
  // lista de la carpeta ya no los trae). Se guardan en photo.info; si Dropbox
  // aún los está preparando (`pending`), se vuelven a pedir la próxima vez.
  // Un fallo aquí nunca impide mostrar la foto.
  function fetchInfo(photo) {
    if (photo.info && !photo.info.pending) return Promise.resolve();
    return Frame.dropboxApi.rpc('files/get_metadata', {
      path: photo.path,
      include_media_info: true
    }).then(function (meta) {
      var media = meta.media_info;
      var data = media && media['.tag'] === 'metadata' ? media.metadata : null;
      var loc = data && data.location;
      var size = data && data.dimensions;
      photo.info = {
        taken: (data && data.time_taken) || meta.client_modified || null,
        lat: loc ? loc.latitude : null,
        lon: loc ? loc.longitude : null,
        width: size ? size.width : 0,
        height: size ? size.height : 0,
        pending: !!media && media['.tag'] === 'pending'
      };
    }, function (err) {
      log('datos de ' + photo.name + ': ' + (err.summary || err.message), true);
    });
  }

  // Cargador para la presentación: devuelve una URL blob: de la miniatura.
  function load(photo, callback) {
    var done = false;
    var timer = setTimeout(function () {
      if (done) return;
      done = true;
      callback(new Error('tiempo agotado'));
    }, THUMB_TIMEOUT_MS);
    Promise.all([
      Frame.dropboxApi.thumbnail(photo.path),
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
    refresh: function () { if (folder && !listing) refresh(); },
    load: load,
    browse: browse
  };
})(window);
