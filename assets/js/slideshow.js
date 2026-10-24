/*
 * Motor de presentación.
 *
 * Usa solo dos <img> fijos (capa visible y capa oculta) y nunca crea un objeto
 * Image por fotografía: la capa oculta sirve también para precargar la
 * siguiente foto. Así, como mucho hay dos imágenes decodificadas en memoria.
 *
 * La fuente de fotos es una lista de { url, name }. En la fase 1 son fotos de
 * prueba locales; en la fase 3 la proporcionará el adaptador de Dropbox.
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
  var opts = { interval: 30, order: 'random', transition: 'fade' };
  var emptyEl;
  var onShow = null;

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

  // ---- Carga en una capa ----

  function loadInto(el, url, done) {
    if (el._url === url && el._state === 'ok') {
      if (done) done(true);
      return;
    }
    el.onload = function () { el._state = 'ok'; if (done) done(true); };
    el.onerror = function () { el._state = 'error'; if (done) done(false); };
    el._url = url;
    el._state = 'loading';
    el.src = url;
  }

  function showAt(p) {
    clearTimers();
    pos = p;
    ensureAhead();
    var my = ++seq;
    var photo = photoAt(pos);
    var el = backLayer();
    if (el._url === photo.url && el._state === 'loading') {
      // La precarga sigue en curso: reutilizarla en vez de reiniciar la descarga.
      el.onload = function () { el._state = 'ok'; if (my === seq) reveal(photo); };
      el.onerror = function () { el._state = 'error'; if (my === seq) failed(photo); };
      return;
    }
    loadInto(el, photo.url, function (ok) {
      if (my !== seq) return;
      if (ok) reveal(photo); else failed(photo);
    });
  }

  function reveal(photo) {
    var oldFront = layers[front];
    var newFront = backLayer();
    newFront.className = 'layer visible';
    oldFront.className = 'layer';
    front = 1 - front;
    failures = 0;
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
      if (my !== seq) return;
      ensureAhead();
      var next = photoAt(pos + 1);
      if (next) loadInto(backLayer(), next.url, null);
    }, delay);
  }

  function failed(photo) {
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

  function setPhotos(list) {
    clearTimers();
    seq++;
    photos = list.slice();
    order = [];
    pos = -1;
    failures = 0;
    if (!photos.length) {
      showEmpty('No hay fotografías para mostrar.');
      return;
    }
    if (opts.order === 'sequential') {
      photos.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
    }
    showAt(0);
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
      if (opts.order === 'sequential') {
        photos.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
      }
      var idx = current ? photos.indexOf(current) : 0;
      order = [idx];
      pos = 0;
      if (opts.order === 'sequential') {
        for (var i = 1; i < photos.length; i++) order.push((idx + i) % photos.length);
      }
      ensureAhead();
      var back = backLayer();
      back._url = null; // descartar la precarga obsoleta
      schedulePreload(50);
    }
    if (intervalChanged && pos >= 0) startTimer(opts.interval * 1000);
  }

  Frame.slideshow = {
    init: function (settings, showCallback) {
      layers = [document.getElementById('layer-a'), document.getElementById('layer-b')];
      emptyEl = document.getElementById('empty');
      onShow = showCallback || null;
      configure(settings);
    },
    configure: configure,
    setPhotos: setPhotos,
    next: function () { if (photos.length) showAt(pos + 1); },
    prev: function () { if (photos.length) showAt(Math.max(0, pos - 1)); },
    play: function () { playing = true; resume(); },
    pause: function () { playing = false; clearTimeout(timer); timer = null; },
    isPlaying: function () { return playing; },
    resume: resume,
    suspend: clearTimers
  };
})(window);
