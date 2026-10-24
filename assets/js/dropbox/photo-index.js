/*
 * Índice de fecha y país de cada foto, para el filtro.
 *
 * Dropbox solo entrega la fecha de la toma y el GPS foto por foto
 * (files/get_metadata), así que el índice se arma en segundo plano, a unas
 * 3 fotos por segundo, mientras se ven las fotos. Lo que ya pidió la
 * presentación para la leyenda también entra aquí.
 *
 * Se guarda en IndexedDB (unos 100 bytes por foto) para no repetirlo al
 * reabrir el marco. Si iOS borra los datos o IndexedDB no está disponible, se
 * vuelve a armar: el índice es un respaldo, nunca la única copia de nada.
 * Contiene fechas y coordenadas de las fotos: se borra con «Desconectar».
 *
 * Registro (también es photo.info para la leyenda):
 *   { taken: 'AAAA-MM-DD…' o null, exact: fecha de la toma (no del archivo),
 *     lat, lon (o null), width, height, cc: código de país, '' sin país,
 *     null sin calcular todavía }
 */
(function (global) {
  'use strict';

  var Frame = global.Frame = global.Frame || {};

  var DB_NAME = 'marco-digital';
  var STORE = 'photos';
  var SAVE_MS = 5000;
  var GAP_MS = 300;        // pausa entre consultas de cada «hilo»
  var CONCURRENCY = 2;
  var ERROR_WAIT_MS = 30000;
  var RESCAN_MS = 60000;   // buscar fotos nuevas sin índice

  var records = Object.create(null);   // ruta → registro
  var dirty = Object.create(null);     // rutas por guardar
  var db = null;
  var saveTimer = null;
  var listeners = [];

  var getList = null;      // function () → lista de fotos de la biblioteca
  var running = false;
  var cursor = 0;
  var inflight = 0;
  var pumpTimer = null;
  var gen = 0;

  function log(text, isError) { Frame.compat.log('Índice: ' + text, isError); }

  // ---- Registros ----

  function yearOf(rec) {
    return rec.exact && rec.taken ? parseInt(rec.taken.slice(0, 4), 10) || 0 : 0;
  }

  function computeCountry(rec) {
    if (rec.lat === null || rec.lat === undefined) { rec.cc = ''; return; }
    if (!Frame.geo.isReady()) { rec.cc = null; return; }
    var p = Frame.geo.place(rec.lat, rec.lon);
    rec.cc = p ? p.code : '';
  }

  function fromMetadata(meta) {
    var media = meta.media_info;
    var data = media && media['.tag'] === 'metadata' ? media.metadata : null;
    var loc = data && data.location;
    var size = data && data.dimensions;
    var rec = {
      taken: (data && data.time_taken) || meta.client_modified || null,
      exact: !!(data && data.time_taken),
      lat: loc ? loc.latitude : null,
      lon: loc ? loc.longitude : null,
      width: size ? size.width : 0,
      height: size ? size.height : 0,
      cc: null
    };
    computeCountry(rec);
    // Dropbox aún prepara los datos: usar lo que hay, sin guardarlo.
    if (media && media['.tag'] === 'pending') rec.pending = true;
    return rec;
  }

  function put(path, rec) {
    records[path] = rec;
    if (rec.pending) return;
    dirty[path] = true;
    if (!saveTimer) saveTimer = setTimeout(save, SAVE_MS);
  }

  function fetchMeta(path) {
    return Frame.dropboxApi.rpc('files/get_metadata', {
      path: path,
      include_media_info: true
    }).then(function (meta) {
      var rec = fromMetadata(meta);
      put(path, rec);
      return rec;
    });
  }

  // Fecha y lugar de una foto: del índice o, si falta, de Dropbox.
  function lookup(photo) {
    var rec = records[photo.path];
    if (rec && !rec.pending) return Promise.resolve(rec);
    return fetchMeta(photo.path);
  }

  // ---- IndexedDB ----

  function openDb() {
    return new Promise(function (resolve) {
      var request;
      try {
        request = global.indexedDB.open(DB_NAME, 1);
      } catch (e) {
        resolve(null);
        return;
      }
      request.onupgradeneeded = function () {
        request.result.createObjectStore(STORE, { keyPath: 'path' });
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { resolve(null); };
      request.onblocked = function () { resolve(null); };
    });
  }

  function loadAll() {
    return new Promise(function (resolve) {
      var loaded = 0;
      try {
        var cursorReq = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
        cursorReq.onsuccess = function () {
          var c = cursorReq.result;
          if (!c) { resolve(loaded); return; }
          var v = c.value;
          if (!records[v.path]) {
            records[v.path] = {
              taken: v.taken, exact: v.exact, lat: v.lat, lon: v.lon,
              width: v.width, height: v.height, cc: v.cc === undefined ? null : v.cc
            };
            loaded++;
          }
          c['continue']();
        };
        cursorReq.onerror = function () { resolve(loaded); };
      } catch (e) {
        resolve(loaded);
      }
    });
  }

  function save() {
    saveTimer = null;
    var paths = Object.keys(dirty);
    dirty = Object.create(null);
    if (paths.length) notify();
    if (!db || !paths.length) return;
    try {
      var store = db.transaction(STORE, 'readwrite').objectStore(STORE);
      for (var i = 0; i < paths.length; i++) {
        var r = records[paths[i]];
        if (!r) continue;
        store.put({
          path: paths[i], taken: r.taken, exact: r.exact, lat: r.lat, lon: r.lon,
          width: r.width, height: r.height, cc: r.cc
        });
      }
    } catch (e) {
      log('no se pudo guardar (' + e.name + ')', true);
    }
  }

  function notify() {
    for (var i = 0; i < listeners.length; i++) listeners[i]();
  }

  // Calcula el país de los registros que llegaron antes que la tabla de
  // ciudades, de a poco para no congelar la pantalla.
  function fillCountries() {
    var pending = [];
    for (var path in records) if (records[path].cc === null) pending.push(path);
    if (!pending.length) return;
    var i = 0;
    (function chunk() {
      var end = Math.min(i + 500, pending.length);
      for (; i < end; i++) {
        var rec = records[pending[i]];
        if (!rec || rec.cc !== null) continue;
        computeCountry(rec);
        if (!rec.pending) dirty[pending[i]] = true;
      }
      if (i < pending.length) setTimeout(chunk, 30);
      else save();
    })();
  }

  // ---- Recorrido en segundo plano ----

  function nextMissing(list) {
    for (var n = 0; n < list.length; n++) {
      if (cursor >= list.length) cursor = 0;
      var photo = list[cursor++];
      var rec = records[photo.path];
      if (!rec) return photo;
    }
    return null;
  }

  function schedule(ms) {
    clearTimeout(pumpTimer);
    pumpTimer = setTimeout(pump, ms);
  }

  function pump() {
    var my = gen;
    if (!running || !getList) return;
    var list = getList();
    while (inflight < CONCURRENCY) {
      var photo = nextMissing(list);
      if (!photo) {
        if (!inflight) schedule(RESCAN_MS);
        return;
      }
      inflight++;
      records[photo.path] = { pending: true, cc: '' }; // en curso: no repetir
      fetchOne(photo, my);
    }
  }

  function fetchOne(photo, my) {
    fetchMeta(photo.path).then(function () {
      if (my !== gen) return;
      inflight--;
      setTimeout(pump, GAP_MS);
    }, function (err) {
      if (my !== gen) return;
      inflight--;
      if (err.status === 409) {
        // La foto ya no existe: no volver a pedirla en esta sesión.
        records[photo.path] = { pending: true, cc: '' };
        setTimeout(pump, GAP_MS);
        return;
      }
      if (records[photo.path] && records[photo.path].pending) delete records[photo.path];
      log('pausa por error (' + (err.summary || err.message) + ')', true);
      if (err.status === 401 || !Frame.dropboxAuth.isConnected()) { running = false; return; }
      schedule(ERROR_WAIT_MS);
    });
  }

  // ---- API pública ----

  function init() {
    return openDb().then(function (opened) {
      db = opened;
      if (!db) {
        log('sin IndexedDB; el índice solo dura mientras la página esté abierta', true);
        return;
      }
      return loadAll().then(function (n) {
        if (n) log(n + ' fotos ya revisadas');
      });
    }).then(function () {
      Frame.geo.ready(function (ok) { if (ok) fillCountries(); });
    });
  }

  function start(listFn) {
    getList = listFn;
    gen++;
    inflight = 0;
    cursor = 0;
    running = true;
    schedule(2000); // dejar pasar primero la primera foto
  }

  function stop() {
    gen++;
    running = false;
    inflight = 0;
    clearTimeout(pumpTimer);
  }

  // Borra todo (al desconectar Dropbox).
  function clear() {
    stop();
    records = Object.create(null);
    dirty = Object.create(null);
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!db) return;
    try { db.transaction(STORE, 'readwrite').objectStore(STORE).clear(); } catch (e) { /* nada */ }
  }

  // Registro listo (con país calculado o sin GPS) de una ruta, o null.
  function get(path) {
    var rec = records[path];
    return rec && !rec.pending ? rec : null;
  }

  Frame.photoIndex = {
    init: init,
    start: start,
    // Reanudar tras volver a primer plano o tras un error.
    resume: function () { if (getList) { running = true; schedule(500); } },
    stop: stop,
    clear: clear,
    get: get,
    lookup: lookup,
    yearOf: yearOf,
    onChange: function (fn) { listeners.push(fn); }
  };
})(window);
