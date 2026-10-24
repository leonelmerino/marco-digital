/*
 * Motor de presentación.
 *
 * Usa solo dos <img> fijos (capa visible y capa oculta) y nunca crea un objeto
 * Image por fotografía: la capa oculta sirve también para precargar la
 * siguiente foto. Así, como mucho hay dos imágenes decodificadas en memoria.
 *
 * La fuente de fotos es una lista de { name, url } (fotos de prueba locales)
 * o de { name, path } (Dropbox). Las segundas se piden al cargador
 * (setLoader), que entrega una URL blob: de la miniatura; cada capa revoca su
 * URL blob anterior al cargar otra, así nunca hay más de dos vivas.
 *
 * Cada capa tiene su leyenda (lugar y fecha), que aparece y se desvanece con
 * ella. El texto lo da setCaption(fn), con fn(photo) → lista de líneas.
 */
(function (global) {
  'use strict';

  var Frame = global.Frame = global.Frame || {};

  var FADE_MS = 1300;      // un poco más que la transición CSS
  var RETRY_MS = 400;      // espera antes de saltar una foto que falló

  var layers = [];
  var front = 0;
  var photos = [];
  var order = [];          // índices de `photos`; se amplía por ciclos
  var pos = -1;            // posición actual dentro de `order`
  var playing = true;
  var timer = null;        // único temporizador de cambio de foto
  var preloadTimer = null;
  var shownAt = 0;
  var failures = 0;
  var seq = 0;             // invalida cargas obsoletas
  var showing = false;     // la foto actual se está cargando en la capa oculta
  var opts = { interval: 30, order: 'random', transition: 'fade' };
  var emptyEl;
  var onShow = null;
  var loader = null;       // function (photo, callback(err, blobUrl))
  var captionFn = null;    // function (photo) → ['línea', …]

  function backLayer() { return layers[1 - front]; }

  function clearTimers() {
    clearTimeout(timer);
    clearTimeout(preloadTimer);
    timer = null;
    preloadTimer = null;
  }

  // ---- Orden ----

  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list;
  }

  function newCycle(previous) {
    var cycle = [];
    for (var i = 0; i < photos.length; i++) cycle.push(i);
    if (opts.order === 'random') {
      shuffle(cycle);
      // Evitar repetir la misma foto al empalmar dos ciclos.
      if (cycle.length > 1 && cycle[0] === previous) {
        var t = cycle[0]; cycle[0] = cycle[1]; cycle[1] = t;
      }
    }
    return cycle;
  }

  // Garantiza que exista order[pos + 1] y recorta el historial antiguo.
  function ensureAhead() {
    if (!photos.length) return;
    if (pos + 1 >= order.length) {
      order = order.concat(newCycle(order.length ? order[order.length - 1] : -1));
    }
    var excess = pos - photos.length * 2;
    if (excess > 0) {
      order = order.slice(excess);
      pos -= excess;
    }
  }

  function photoAt(p) { return photos[order[p]]; }

  function keyOf(photo) { return photo.url || photo.path; }

  function sortByName(list) {
    list.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
  }

  // ---- Carga en una capa ----

  function setSource(el, src, isBlob) {
    if (el._blob) global.URL.revokeObjectURL(el._blob);
    el._blob = isBlob ? src : null;
    el.src = src;
  }

  function finish(el, ok) {
    el._state = ok ? 'ok' : 'error';
    if (el._done) el._done(ok);
  }

  function loadInto(el, photo, done) {
    var key = keyOf(photo);
    if (el._key === key && el._state === 'ok') {
      if (done) done(true);
      return;
    }
    if (el._key === key && el._state === 'loading') {
      el._done = done; // ya se está descargando: no empezar de nuevo
      return;
    }
    el._key = key;
    el._state = 'loading';
    el._done = done;
    el.onload = function () { finish(el, true); };
    el.onerror = function () { finish(el, false); };
    if (photo.url) {
      setSource(el, photo.url, false);
      return;
    }
    loader(photo, function (err, blobUrl) {
      if (el._key !== key) { // la capa ya se usa para otra foto
        if (blobUrl) global.URL.revokeObjectURL(blobUrl);
        return;
      }
      if (err) finish(el, false);
      else setSource(el, blobUrl, true);
    });
  }

  function showAt(p) {
    clearTimers();
    pos = p;
    ensureAhead();
    var my = ++seq;
    var photo = photoAt(pos);
    var el = backLayer();
    showing = true;
    if (el._key === keyOf(photo) && el._state === 'loading') {
      // La precarga sigue en curso: reutilizarla en vez de reiniciar la descarga.
      el._done = function (ok) {
        if (my !== seq) return;
        if (ok) reveal(photo); else failed(photo);
      };
      return;
    }
    loadInto(el, photo, function (ok) {
      if (my !== seq) return;
      if (ok) reveal(photo); else failed(photo);
    });
  }

  function renderCaption(el, photo) {
    var lines = captionFn && photo ? captionFn(photo) : [];
    var box = el._caption;
    while (box.firstChild) box.removeChild(box.firstChild);
    for (var i = 0; i < lines.length; i++) {
      var line = document.createElement('div');
      line.textContent = lines[i];
      box.appendChild(line);
    }
  }

  function reveal(photo) {
    var oldFront = layers[front];
    var newFront = backLayer();
    newFront._photo = photo;
    renderCaption(newFront, photo);
    newFront.className = 'layer visible';
    newFront._caption.className = 'caption visible';
    oldFront.className = 'layer';
    oldFront._caption.className = 'caption';
    front = 1 - front;
    failures = 0;
    showing = false;
    emptyEl.className = 'empty hidden';
    if (onShow) onShow(photo);
    Frame.compat.log('Mostrando ' + photo.name);

    schedulePreload(opts.transition === 'fade' ? FADE_MS : 50);
    startTimer(opts.interval * 1000);
  }

  // La capa oculta precarga la siguiente foto (una sola), siempre después del
  // fundido para no cambiar la imagen que todavía se está desvaneciendo.
  function schedulePreload(delay) {
    clearTimeout(preloadTimer);
    var my = seq;
    preloadTimer = setTimeout(function () {
      // Nunca precargar en la capa donde todavía se carga la foto actual.
      if (my !== seq || showing) return;
      ensureAhead();
      var next = photoAt(pos + 1);
      if (next) loadInto(backLayer(), next, null);
    }, delay);
  }

  function failed(photo) {
    showing = false;
    failures++;
    Frame.compat.log('No se pudo cargar ' + photo.name, true);
    if (failures >= photos.length) {
      showEmpty('No se pudo cargar ninguna fotografía. Se reintentará.');
      startTimer(opts.interval * 1000);
      return;
    }
    // No bloquear la presentación: pasar a la siguiente.
    timer = setTimeout(function () { showAt(pos + 1); }, RETRY_MS);
  }

  function showEmpty(message) {
    emptyEl.textContent = message;
    emptyEl.className = 'empty';
  }

  // ---- Temporizador ----

  function startTimer(ms) {
    clearTimeout(timer);
    timer = null;
    shownAt = Date.now();
    if (!playing || !photos.length) return;
    timer = setTimeout(function () { showAt(pos + 1); }, ms);
  }

  // Al volver a primer plano: los temporizadores pueden haberse congelado.
  function resume() {
    if (!playing || !photos.length) return;
    if (pos < 0) { showAt(0); return; }
    var elapsed = Date.now() - shownAt;
    var remaining = opts.interval * 1000 - elapsed;
    if (remaining <= 0) showAt(pos + 1);
    else {
      clearTimeout(timer);
      timer = setTimeout(function () { showAt(pos + 1); }, remaining);
      schedulePreload(50); // `suspend` pudo cancelar la precarga
    }
  }

  // ---- API pública ----

  function setPhotos(list, emptyMessage) {
    clearTimers();
    seq++;
    photos = list.slice();
    order = [];
    pos = -1;
    failures = 0;
    showing = false;
    if (!photos.length) {
      showEmpty(emptyMessage || 'No hay fotografías para mostrar.');
      return;
    }
    if (opts.order === 'sequential') sortByName(photos);
    showAt(0);
  }

  function indexOfKey(key) {
    for (var i = 0; i < photos.length; i++) if (keyOf(photos[i]) === key) return i;
    return -1;
  }

  // Sustituye la lista (por ejemplo, al llegar más fotos de Dropbox) sin
  // interrumpir la foto actual ni la que ya se está precargando.
  function update(list) {
    var current = pos >= 0 ? photoAt(pos) : null;
    var upcoming = pos >= 0 ? photoAt(pos + 1) : null;
    if (!current) {
      setPhotos(list);
      return;
    }
    photos = list.slice();
    if (!photos.length) {
      clearTimers();
      seq++;
      order = [];
      pos = -1;
      showing = false;
      showEmpty('No hay fotografías para mostrar.');
      return;
    }
    if (opts.order === 'sequential') sortByName(photos);
    var ci = indexOfKey(keyOf(current));
    order = [];
    if (opts.order === 'sequential') {
      var from = ci >= 0 ? ci : 0;
      for (var i = 0; i < photos.length; i++) order.push((from + i) % photos.length);
    } else {
      if (ci >= 0) order.push(ci);
      var ni = upcoming ? indexOfKey(keyOf(upcoming)) : -1;
      if (ni >= 0 && ni !== ci) order.push(ni);
    }
    pos = ci >= 0 ? 0 : -1; // si la actual desapareció, la siguiente es order[0]
    ensureAhead();
    // Esperar al final del fundido antes de tocar la capa oculta; si la foto
    // actual aún se está cargando, reveal() programará la precarga.
    if (playing && !showing) schedulePreload(Math.max(50, FADE_MS - (Date.now() - shownAt)));
  }

  function configure(settings) {
    var orderChanged = settings.order !== opts.order;
    var intervalChanged = settings.interval !== opts.interval;
    opts.interval = settings.interval;
    opts.order = settings.order;
    opts.transition = settings.transition;
    if (orderChanged && photos.length) {
      // Conservar la foto actual y rehacer lo que viene después.
      var current = pos >= 0 ? photos[order[pos]] : null;
      if (opts.order === 'sequential') sortByName(photos);
      var idx = current ? photos.indexOf(current) : 0;
      order = [idx];
      pos = 0;
      if (opts.order === 'sequential') {
        for (var i = 1; i < photos.length; i++) order.push((idx + i) % photos.length);
      }
      ensureAhead();
      var back = backLayer();
      back._key = null; // descartar la precarga obsoleta
      schedulePreload(50);
    }
    if (intervalChanged && pos >= 0) startTimer(opts.interval * 1000);
  }

  Frame.slideshow = {
    init: function (settings, showCallback) {
      layers = [document.getElementById('layer-a'), document.getElementById('layer-b')];
      layers[0]._caption = document.getElementById('caption-a');
      layers[1]._caption = document.getElementById('caption-b');
      emptyEl = document.getElementById('empty');
      onShow = showCallback || null;
      configure(settings);
    },
    configure: configure,
    setPhotos: setPhotos,
    update: update,
    setLoader: function (fn) { loader = fn; },
    setCaption: function (fn) { captionFn = fn; },
    // Rehace la leyenda visible (por ejemplo, al cargar la tabla de ciudades).
    refreshCaption: function () {
      var el = layers[front];
      if (el && el._photo) renderCaption(el, el._photo);
    },
    next: function () { if (photos.length) showAt(pos + 1); },
    prev: function () { if (photos.length) showAt(Math.max(0, pos - 1)); },
    play: function () { playing = true; resume(); },
    pause: function () { playing = false; clearTimeout(timer); timer = null; },
    isPlaying: function () { return playing; },
    resume: resume,
    suspend: clearTimers
  };
})(window);
