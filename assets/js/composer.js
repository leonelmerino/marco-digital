/*
 * Compositor de la grilla: elige las compañeras de una foto vertical entre
 * las próximas del orden, por parecido de color y de fecha.
 *
 * - Color: el promedio de una miniatura diminuta (64×64). Las de Dropbox se
 *   piden de a 25 en una sola llamada (files/get_thumbnail_batch), así que
 *   cuesta unos 50 KB por vista y además da la orientación de cada candidata
 *   sin descargar la foto grande. Se recuerdan las ya analizadas.
 * - Fecha: el día del año, sin importar el año (marzo con marzo, verano con
 *   verano, suponiendo el mismo hemisferio). Sale del índice, de la leyenda
 *   o del nombre del archivo.
 * - Con una vertical parecida se hace una pareja; si no, la vertical va con
 *   las dos horizontales más parecidas. Si algo falla, la presentación vuelve
 *   a tomar simplemente las fotos siguientes.
 */
(function (global) {
  'use strict';

  var Frame = global.Frame = global.Frame || {};

  var BATCH_MAX = 25;
  var TIMEOUT_MS = 6000;
  var CACHE_MAX = 3000;
  var SAMPLE = 12;           // lado del lienzo para promediar el color
  var PAIR_BONUS = 0.05;     // preferir la pareja: recorta menos las fotos

  var cache = Object.create(null);   // clave → { landscape, color } o null
  var cacheKeys = [];
  var canvas = null;

  function keyOf(photo) { return photo.url || photo.path; }

  function remember(key, info) {
    if (!(key in cache)) {
      cacheKeys.push(key);
      if (cacheKeys.length > CACHE_MAX) delete cache[cacheKeys.shift()];
    }
    cache[key] = info;
  }

  // ---- Color ----

  function analyze(img) {
    if (!img.naturalWidth) return null;
    try {
      canvas = canvas || document.createElement('canvas');
      canvas.width = canvas.height = SAMPLE;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
      var data = ctx.getImageData(0, 0, SAMPLE, SAMPLE).data;
      var r = 0, g = 0, b = 0;
      for (var i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
      var n = data.length / 4;
      return { landscape: img.naturalWidth >= img.naturalHeight, color: [r / n, g / n, b / n] };
    } catch (e) {
      return null; // lienzo bloqueado u otro fallo: sin color
    }
  }

  function loadImage(src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  }

  function fromBase64(text) {
    var raw = global.atob(text);
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new Blob([bytes], { type: 'image/jpeg' });
  }

  // Analiza las candidatas que aún no están en caché.
  function fetchInfo(photos) {
    var local = [];
    var remote = [];
    for (var i = 0; i < photos.length; i++) {
      if (keyOf(photos[i]) in cache) continue;
      if (photos[i].url) local.push(photos[i]);
      else remote.push(photos[i]);
    }
    var jobs = local.map(function (photo) {
      return loadImage(photo.url).then(function (img) { remember(photo.url, img ? analyze(img) : null); });
    });
    if (remote.length) {
      remote = remote.slice(0, BATCH_MAX);
      jobs.push(Frame.dropboxApi.thumbnailBatch(remote.map(keyOf)).then(function (result) {
        var entries = (result && result.entries) || [];
        return Promise.all(remote.map(function (photo, i) {
          var e = entries[i];
          if (!e || e['.tag'] !== 'success' || !e.thumbnail) { remember(photo.path, null); return null; }
          var url = global.URL.createObjectURL(fromBase64(e.thumbnail));
          return loadImage(url).then(function (img) {
            global.URL.revokeObjectURL(url);
            remember(photo.path, img ? analyze(img) : null);
          });
        }));
      }));
    }
    return Promise.all(jobs);
  }

  // ---- Parecido ----

  // Distancia de color «redmean», aproximada a la percepción, de 0 a ~1.
  function colorDistance(a, b) {
    var rm = (a[0] + b[0]) / 2;
    var dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db) / 765;
  }

  function dayOfYear(date) {
    var start = Date.UTC(date.y, 0, 1);
    return Math.floor((Date.UTC(date.y, date.m - 1, date.d) - start) / 86400000);
  }

  // Distancia entre fechas por día del año (circular), de 0 a 1.
  function seasonDistance(a, b) {
    var diff = Math.abs(dayOfYear(a) - dayOfYear(b));
    return Math.min(diff, 365 - diff) / 182.5;
  }

  function distance(p, c) {
    var parts = [];
    var weights = [];
    if (p.color && c.color) { parts.push(colorDistance(p.color, c.color)); weights.push(0.6); }
    if (p.date && c.date) { parts.push(seasonDistance(p.date, c.date)); weights.push(0.4); }
    if (!parts.length) return 0.5;
    var sum = 0, w = 0;
    for (var i = 0; i < parts.length; i++) { sum += parts[i] * weights[i]; w += weights[i]; }
    return sum / w;
  }

  // ---- Elección ----

  // primary: { photo, img (ya cargada), landscapeScreen }; pool: candidatas
  // en orden. Devuelve la promesa de [vertical] o [horizontal, horizontal],
  // o null si no hay con qué componer.
  function choose(primary, pool) {
    var mine = analyze(primary.img) || {};
    var p = { color: mine.color, date: Frame.photoInfo.dateOf(primary.photo) };
    var primaryLandscape = primary.img.naturalWidth >= primary.img.naturalHeight;

    var timeout = new Promise(function (resolve) { setTimeout(resolve, TIMEOUT_MS); });
    return Promise.race([fetchInfo(pool), timeout]).then(function () {
      var odd = [];      // misma orientación que la principal
      var fits = [];     // llenan bien su celda de la columna
      for (var i = 0; i < pool.length; i++) {
        var info = cache[keyOf(pool[i])];
        if (!info) continue;
        var c = { photo: pool[i], color: info.color, date: Frame.photoInfo.dateOf(pool[i]) };
        c.d = distance(p, c);
        if (info.landscape === primaryLandscape) odd.push(c);
        else if (info.landscape === primary.landscapeScreen) fits.push(c);
      }
      var byDistance = function (a, b) { return a.d - b.d; };
      odd.sort(byDistance);
      fits.sort(byDistance);
      var pair = odd.length ? odd[0] : null;
      var trio = fits.length >= 2 ? [fits[0], fits[1]] : null;
      if (pair && (!trio || pair.d <= (trio[0].d + trio[1].d) / 2 + PAIR_BONUS)) return [pair.photo];
      if (trio) return [trio[0].photo, trio[1].photo];
      return null;
    });
  }

  Frame.composer = { choose: choose };
})(window);
