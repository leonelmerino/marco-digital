/*
 * Motor de presentación.
 *
 * Hay dos capas fijas (la visible y la oculta) y cada una muestra una «vista»
 * de una a tres fotos. La capa oculta prepara la vista siguiente mientras se
 * ve la actual. Nunca se crea un objeto Image por fotografía: cada capa tiene
 * tres <img> fijos, así que como mucho hay seis imágenes decodificadas.
 *
 * Vistas (con la pantalla horizontal; con la pantalla vertical, al revés):
 * - Foto horizontal: sola, a pantalla completa.
 * - Foto vertical + vertical: una al lado de la otra.
 * - Foto vertical + horizontal + horizontal: la vertical a la izquierda y las
 *   otras dos apiladas a la derecha.
 * - Vertical + horizontal + vertical: se juntan las dos verticales y la
 *   horizontal pasa a la vista siguiente (se intercambian en el orden).
 * La orientación se lee de la miniatura ya cargada (Dropbox la entrega girada
 * según la foto), así que la vista se arma foto a foto.
 * Con un compositor (setComposer, ver composer.js), las compañeras de una
 * vertical no son simplemente las siguientes: se eligen entre las próximas
 * por color y por fecha parecida, y se adelantan en el orden.
 *
 * Orden aleatorio por ciclos que mezclan años (setYearFn): cada foto se toma
 * de un año elegido al azar, con más peso para los años con más fotos pero
 * sin que los años con pocas queden para el final, y sin repetir año seguido.
 *
 * Historial: las vistas ya mostradas se pueden volver a ver hacia atrás
 * (prev) y luego hacia adelante (next) tal como eran.
 *
 * La fuente de fotos es una lista de { name, url } (fotos de prueba locales)
 * o de { name, path } (Dropbox). Las segundas se piden al cargador
 * (setLoader), que entrega una URL blob: de la miniatura; cada <img> revoca su
 * URL blob anterior al cargar otra. Las fotos que acompañan a una vertical se
 * piden en tamaño pequeño, porque ocupan media pantalla o un cuarto.
 *
 * Cada foto tiene su leyenda (lugar y fecha), que aparece y se desvanece con
 * la capa. El texto lo da setCaption(fn), con fn(photo) → lista de líneas.
 */
(function (global) {
  'use strict';

  var Frame = global.Frame = global.Frame || {};

  var FADE_MS = 1300;      // un poco más que la transición CSS
  var RETRY_MS = 400;      // espera antes de saltar una foto que falló
  var COMPOSE_POOL = 12;   // candidatas a compañera de una vertical

  var layers = [];         // { el, cells: [{ el, img, caption }], … }
  var front = 0;
  var photos = [];
  var order = [];          // índices de `photos`; se amplía por ciclos
  var pos = -1;            // posición en `order` de la primera foto de la vista actual
  var count = 1;           // fotos de la vista actual
  var playing = true;
  var timer = null;        // único temporizador de cambio de vista
  var preloadTimer = null;
  var shownAt = 0;
  var failures = 0;
  var seq = 0;             // invalida esperas obsoletas
  var showing = false;     // la vista actual se está preparando en la capa oculta
  var opts = { interval: 30, order: 'random', transition: 'fade', grid: true };
  var HISTORY_MAX = 50;
  var history = [];        // vistas anteriores: [{ photos: [...] }]
  var future = [];         // vistas por delante tras volver atrás
  var current = null;      // vista visible: { photos: [...] }
  var yearFn = null;       // function (photo) → año o 0
  var composer = null;     // function (primary, candidatas) → Promise
  var emptyEl;
  var onShow = null;
  var loader = null;       // function (photo, callback(err, blobUrl), small)
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

  // Ciclo aleatorio que mezcla años: en cada paso se elige un año con peso
  // proporcional a la raíz de sus fotos (2016 con 9000 fotos pesa 3 veces
  // más que 2009 con 1000, no 9) y se toma una foto al azar de ese año.
  function diverseCycle() {
    var buckets = {};
    var keys = [];
    for (var i = 0; i < photos.length; i++) {
      var y = yearFn(photos[i]) || 0;
      if (!buckets[y]) { buckets[y] = []; keys.push(y); }
      buckets[y].push(i);
    }
    if (keys.length < 2) return shuffle(buckets[keys[0]] || []);
    for (var k = 0; k < keys.length; k++) shuffle(buckets[keys[k]]);
    var cycle = [];
    var last = null;
    while (cycle.length < photos.length) {
      var total = 0;
      var j;
      for (j = 0; j < keys.length; j++) {
        var n = buckets[keys[j]].length;
        if (n && (keys[j] !== last || keys.length === 1)) total += Math.sqrt(n);
      }
      if (!total) last = null; // solo queda el año anterior
      var r = Math.random() * (total || 1);
      var pick = -1;
      for (j = 0; j < keys.length; j++) {
        var m = buckets[keys[j]].length;
        if (!m || (total && keys[j] === last)) continue;
        pick = j;
        r -= Math.sqrt(m);
        if (r <= 0) break;
      }
      last = keys[pick];
      cycle.push(buckets[last].pop());
    }
    return cycle;
  }

  function newCycle(previous) {
    var cycle;
    if (opts.order === 'random' && yearFn) {
      cycle = diverseCycle();
    } else {
      cycle = [];
      for (var i = 0; i < photos.length; i++) cycle.push(i);
      if (opts.order === 'random') shuffle(cycle);
    }
    // Evitar repetir la misma foto al empalmar dos ciclos.
    if (opts.order === 'random' && cycle.length > 1 && cycle[0] === previous) {
      var t = cycle[0]; cycle[0] = cycle[1]; cycle[1] = t;
    }
    return cycle;
  }

  // Garantiza que exista order[upto] y recorta el historial antiguo.
  // Devuelve cuántas posiciones se recortaron.
  function ensureAhead(upto) {
    if (!photos.length) return 0;
    var excess = pos - photos.length * 2;
    if (excess > 0) {
      order = order.slice(excess);
      pos -= excess;
      upto -= excess;
    } else {
      excess = 0;
    }
    while (upto >= order.length) {
      order = order.concat(newCycle(order.length ? order[order.length - 1] : -1));
    }
    return excess;
  }

  function photoAt(p) { return p >= 0 ? photos[order[p]] : undefined; }

  function nextStart() { return pos < 0 ? 0 : pos + count; }

  function keyOf(photo) { return photo ? photo.url || photo.path : ''; }

  function sortByName(list) {
    list.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
  }

  // ---- Carga de una foto en una celda ----

  function setSource(img, src, isBlob) {
    if (img._blob) global.URL.revokeObjectURL(img._blob);
    img._blob = isBlob ? src : null;
    if (src) img.src = src;
    else img.removeAttribute('src');
  }

  // Libera la imagen de una celda que la vista no usa.
  function clearCell(cell) {
    var img = cell.img;
    img._key = null;
    img._state = null;
    img._done = null;
    img.onload = img.onerror = null;
    setSource(img, '', false);
    cell.el.className = 'cell hidden';
  }

  function finishImg(img, ok) {
    img._state = ok ? 'ok' : 'error';
    var done = img._done;
    img._done = null;
    if (done) done(ok);
  }

  function loadImg(cell, photo, small, done) {
    var img = cell.img;
    var key = keyOf(photo) + (small ? '#s' : '');
    if (img._key === key && img._state === 'ok') { done(true); return; }
    if (img._key === key && img._state === 'loading') { img._done = done; return; }
    img._key = key;
    img._state = 'loading';
    img._done = done;
    img.onload = function () { finishImg(img, true); };
    img.onerror = function () { finishImg(img, false); };
    if (photo.url) {
      setSource(img, photo.url, false);
      return;
    }
    loader(photo, function (err, blobUrl) {
      if (img._key !== key) { // la celda ya se usa para otra foto
        if (blobUrl) global.URL.revokeObjectURL(blobUrl);
        return;
      }
      if (err) finishImg(img, false);
      else setSource(img, blobUrl, true);
    }, small);
  }

  // ---- Vistas ----

  function isLandscapeScreen() { return global.innerWidth >= global.innerHeight; }

  // ¿La foto llena bien la pantalla en su orientación actual?
  function fitsScreen(img) {
    var landscape = img.naturalWidth >= img.naturalHeight;
    return landscape === isLandscapeScreen() || img.naturalWidth === img.naturalHeight;
  }

  // Posición de una celda en fracciones de pantalla; con 4 px de separación.
  function place(cell, x, y, w, h) {
    var s = cell.el.style;
    if (!isLandscapeScreen()) { var t = x; x = y; y = t; t = w; w = h; h = t; }
    s.left = x ? 'calc(' + x * 100 + '% + 2px)' : '0';
    s.top = y ? 'calc(' + y * 100 + '% + 2px)' : '0';
    s.width = w < 1 ? 'calc(' + w * 100 + '% - 2px)' : '100%';
    s.height = h < 1 ? 'calc(' + h * 100 + '% - 2px)' : '100%';
  }

  function renderCaption(cell, photo) {
    var lines = captionFn && photo ? captionFn(photo) : [];
    var box = cell.caption;
    while (box.firstChild) box.removeChild(box.firstChild);
    for (var i = 0; i < lines.length; i++) {
      var line = document.createElement('div');
      line.textContent = lines[i];
      box.appendChild(line);
    }
  }

  // Coloca las celdas usadas según layer.used (índices de candidatas).
  function layout(layer) {
    var used = layer.used;
    var cells = [];
    for (var i = 0; i < layer.cells.length; i++) {
      var cell = layer.cells[i];
      if (used.indexOf(i) < 0) { if (cell.img._key) clearCell(cell); continue; }
      cells.push(cell);
      renderCaption(cell, layer.cands[i]);
    }
    if (cells.length === 1) {
      cells[0].el.className = 'cell single';
      place(cells[0], 0, 0, 1, 1);
    } else if (cells.length === 2) {
      cells[0].el.className = cells[1].el.className = 'cell';
      place(cells[0], 0, 0, 0.5, 1);
      place(cells[1], 0.5, 0, 0.5, 1);
    } else {
      cells[0].el.className = cells[1].el.className = cells[2].el.className = 'cell';
      place(cells[0], 0, 0, 0.5, 1);
      place(cells[1], 0.5, 0, 0.5, 0.5);
      place(cells[2], 0.5, 0.5, 0.5, 0.5);
    }
  }

  function sameCands(layer, cands) {
    if (!layer.cands) return false;
    for (var i = 0; i < 3; i++) if (keyOf(layer.cands[i]) !== keyOf(cands[i])) return false;
    return true;
  }

  // Lleva las fotos elegidas justo detrás de la posición p del orden.
  function moveAfter(p, chosen) {
    for (var c = 0; c < chosen.length; c++) {
      var key = keyOf(chosen[c]);
      for (var q = p + 1 + c; q < order.length; q++) {
        if (keyOf(photoAt(q)) !== key) continue;
        var idx = order.splice(q, 1)[0];
        order.splice(p + 1 + c, 0, idx);
        break;
      }
    }
  }

  // Carga en la capa las fotos de `photos` (la primera a tamaño completo) y
  // la arma con esas celdas.
  function loadView(layer, my, photos, done) {
    var used = [];
    var pending = photos.length;
    var ok = true;
    for (var i = 0; i < photos.length; i++) used.push(i);
    photos.forEach(function (photo, i) {
      loadImg(layer.cells[i], photo, i > 0, function (fine) {
        if (my !== layer.gen) return;
        ok = ok && fine;
        if (--pending) return;
        done(ok ? used : null);
      });
    });
  }

  // Prepara en `layer` la vista que empieza en la posición p (que puede
  // moverse si ensureAhead recorta el historial). done(ok).
  function build(layer, p, done) {
    p -= ensureAhead(p + COMPOSE_POOL);
    var cands = [photoAt(p), photoAt(p + 1), photoAt(p + 2)];
    // Con muy pocas fotos el orden puede repetir la primera: no juntarla consigo.
    for (var c = 1; c < 3; c++) {
      if (!cands[c] || keyOf(cands[c]) === keyOf(cands[0])) cands[c] = null;
    }
    if (cands[2] && keyOf(cands[2]) === keyOf(cands[1])) cands[2] = null;

    if (!layer.forced && sameCands(layer, cands) && layer.state !== 'error') {
      if (layer.state === 'ready') { if (done) done(true); return; }
      layer.done = done; // ya se está preparando
      return;
    }
    var my = ++layer.gen;
    layer.forced = false;
    layer.cands = cands;
    layer.state = 'building';
    layer.done = done;

    function finish(used) {
      if (my !== layer.gen) return;
      layer.used = used;
      layout(layer);
      layer.state = 'ready';
      if (layer.done) layer.done(true);
    }

    // Compañeras elegidas por el compositor; si falla, las siguientes.
    function compose() {
      // Sin repetir: con pocas fotos el orden ya trae el ciclo siguiente.
      var pool = [];
      var taken = {};
      taken[keyOf(cands[0])] = true;
      for (var q = p + 1; q <= p + COMPOSE_POOL && q < order.length; q++) {
        var cand = photoAt(q);
        if (!cand || taken[keyOf(cand)]) continue;
        taken[keyOf(cand)] = true;
        pool.push(cand);
      }
      composer({ photo: cands[0], img: layer.cells[0].img, landscapeScreen: isLandscapeScreen() }, pool)
        .then(function (chosen) {
          if (my !== layer.gen) return;
          if (!chosen || !chosen.length) { sequential(); return; }
          moveAfter(p, chosen);
          layer.cands = [cands[0], photoAt(p + 1), photoAt(p + 2)];
          loadView(layer, my, [cands[0]].concat(chosen), function (used) {
            if (my !== layer.gen) return;
            // Si una compañera falló, la vertical sale sola.
            finish(used && used.length === chosen.length + 1 ? used : [0]);
          });
        }, function () {
          if (my === layer.gen) sequential();
        });
    }

    function sequential() {
      loadImg(layer.cells[1], cands[1], true, function (ok1) {
        if (my !== layer.gen) return;
        if (!ok1) { finish([0]); return; }
        if (!fitsScreen(layer.cells[1].img)) { finish([0, 1]); return; }
        if (!cands[2]) { finish([0]); return; }
        loadImg(layer.cells[2], cands[2], true, function (ok2) {
          if (my !== layer.gen) return;
          if (!ok2) finish([0]);
          else if (fitsScreen(layer.cells[2].img)) finish([0, 1, 2]);
          else finish([0, 2]);
        });
      });
    }

    loadImg(layer.cells[0], cands[0], false, function (ok) {
      if (my !== layer.gen) return;
      if (!ok) {
        layer.state = 'error';
        if (layer.done) layer.done(false);
        return;
      }
      if (!opts.grid || !cands[1] || fitsScreen(layer.cells[0].img)) { finish([0]); return; }
      if (composer) compose(); else sequential();
    });
  }

  // Prepara una vista del historial, con las mismas fotos que tenía.
  function buildView(layer, view, done) {
    var ph = view.photos;
    var cands = [ph[0], ph[1] || null, ph[2] || null];
    if (layer.forced && sameCands(layer, cands) && layer.state !== 'error') {
      if (layer.state === 'ready') { if (done) done(true); return; }
      layer.done = done;
      return;
    }
    var my = ++layer.gen;
    layer.forced = true;
    layer.cands = cands;
    layer.state = 'building';
    layer.done = done;
    loadView(layer, my, ph, function (used) {
      if (my !== layer.gen) return;
      if (!used) {
        layer.state = 'error';
        if (layer.done) layer.done(false);
        return;
      }
      layer.used = used;
      layout(layer);
      layer.state = 'ready';
      if (layer.done) layer.done(true);
    });
  }

  function showAt(p) {
    clearTimers();
    pos = p;
    count = 1;
    var my = ++seq;
    var layer = backLayer();
    showing = true;
    build(layer, p, function (ok) {
      if (my !== seq) return;
      if (ok) reveal(layer, 'forward'); else failed(layer.cands[0]);
    });
  }

  // Muestra una vista del historial (dir: 'back' o 'forward').
  function showView(view, dir) {
    clearTimers();
    var my = ++seq;
    var layer = backLayer();
    showing = true;
    buildView(layer, view, function (ok) {
      if (my !== seq) return;
      if (ok) { reveal(layer, dir); return; }
      // La foto ya no se puede cargar: seguir con la presentación normal.
      showing = false;
      showAt(nextStart());
    });
  }

  function forward() {
    if (!photos.length) return;
    if (future.length) showView(future.pop(), 'forward');
    else showAt(nextStart());
  }

  function back() {
    if (!history.length) return false;
    showView(history.pop(), 'back');
    return true;
  }

  function reveal(layer, dir) {
    if (!layer.forced) {
      // Vertical + horizontal + vertical: la horizontal pasa a la vista siguiente.
      if (layer.used.length === 2 && layer.used[1] === 2 &&
          keyOf(photoAt(pos + 2)) === keyOf(layer.cands[2])) {
        var t = order[pos + 1]; order[pos + 1] = order[pos + 2]; order[pos + 2] = t;
      }
      count = layer.used.length;
    }
    var shown = [];
    for (var i = 0; i < layer.used.length; i++) shown.push(layer.cands[layer.used[i]]);
    if (current) {
      if (dir === 'back') future.push(current);
      else history.push(current);
      if (history.length > HISTORY_MAX) history.shift();
    }
    current = { photos: shown };
    var oldFront = layers[front];
    layer.el.className = 'layer visible';
    oldFront.el.className = 'layer';
    front = 1 - front;
    failures = 0;
    showing = false;
    emptyEl.className = 'empty hidden';
    if (onShow) onShow(shown[0]);
    Frame.compat.log('Mostrando ' + shown.map(function (ph) { return ph.name; }).join(' + ') +
      (dir === 'back' ? ' (atrás)' : ''));

    schedulePreload(opts.transition === 'fade' ? FADE_MS : 50);
    startTimer(opts.interval * 1000);
  }

  // La capa oculta prepara la vista siguiente, siempre después del fundido
  // para no cambiar la imagen que todavía se está desvaneciendo.
  function schedulePreload(delay) {
    clearTimeout(preloadTimer);
    var my = seq;
    preloadTimer = setTimeout(function () {
      // Nunca precargar en la capa donde todavía se prepara la vista actual.
      if (my !== seq || showing || !photos.length) return;
      if (future.length) buildView(backLayer(), future[future.length - 1], null);
      else build(backLayer(), nextStart(), null);
    }, delay);
  }

  function failed(photo) {
    showing = false;
    failures++;
    Frame.compat.log('No se pudo cargar ' + (photo ? photo.name : '?'), true);
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
    timer = setTimeout(forward, ms);
  }

  // Al volver a primer plano: los temporizadores pueden haberse congelado.
  function resume() {
    if (!playing || !photos.length) return;
    if (pos < 0) { showAt(0); return; }
    var elapsed = Date.now() - shownAt;
    var remaining = opts.interval * 1000 - elapsed;
    if (remaining <= 0) forward();
    else {
      clearTimeout(timer);
      timer = setTimeout(forward, remaining);
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
    count = 1;
    failures = 0;
    showing = false;
    history = [];
    future = [];
    current = null;
    if (!photos.length) {
      showEmpty(emptyMessage || 'No hay fotografías para mostrar.');
      return;
    }
    if (opts.order === 'sequential') sortByName(photos);
    showAt(0);
  }

  // Sustituye la lista (por ejemplo, al llegar más fotos de Dropbox) sin
  // interrumpir la vista actual ni la siguiente que ya se está preparando:
  // se conservan, por clave, las fotos de la vista actual y las tres
  // candidatas a la siguiente.
  function update(list) {
    if (pos < 0 || !photoAt(pos)) {
      setPhotos(list);
      return;
    }
    var keep = [];
    for (var p = pos; p < Math.min(order.length, pos + count + 3); p++) keep.push(keyOf(photoAt(p)));
    photos = list.slice();
    if (!photos.length) {
      clearTimers();
      seq++;
      order = [];
      pos = -1;
      count = 1;
      showing = false;
      showEmpty('No hay fotografías para mostrar.');
      return;
    }
    if (opts.order === 'sequential') sortByName(photos);
    var index = {};
    for (var i = 0; i < photos.length; i++) index[keyOf(photos[i])] = i;
    var has = function (key) { return Object.prototype.hasOwnProperty.call(index, key); };
    var currentGone = !has(keep[0]);
    order = [];
    if (opts.order === 'sequential') {
      var from = currentGone ? 0 : index[keep[0]];
      for (var j = 0; j < photos.length; j++) order.push((from + j) % photos.length);
    } else {
      for (var k = 0; k < keep.length; k++) {
        if (has(keep[k]) && order.indexOf(index[keep[k]]) < 0) order.push(index[keep[k]]);
      }
    }
    // Si la foto actual desapareció, la siguiente vista empieza en order[0].
    if (currentGone) { pos = -1; count = 1; } else { pos = 0; }
    ensureAhead(nextStart() + 2);
    // Esperar al final del fundido antes de tocar la capa oculta; si la vista
    // actual aún se está preparando, reveal() programará la precarga.
    if (playing && !showing) schedulePreload(Math.max(50, FADE_MS - (Date.now() - shownAt)));
  }

  function configure(settings) {
    var orderChanged = settings.order !== opts.order;
    var intervalChanged = settings.interval !== opts.interval;
    var gridChanged = settings.grid !== opts.grid;
    opts.interval = settings.interval;
    opts.order = settings.order;
    opts.transition = settings.transition;
    opts.grid = settings.grid;
    if (orderChanged && photos.length) {
      // Conservar la foto actual y rehacer lo que viene después.
      var current = pos >= 0 ? photoAt(pos) : null;
      if (opts.order === 'sequential') sortByName(photos);
      var idx = current ? photos.indexOf(current) : 0;
      order = [idx];
      pos = 0;
      count = 1;
      if (opts.order === 'sequential') {
        for (var i = 1; i < photos.length; i++) order.push((idx + i) % photos.length);
      }
    }
    if ((orderChanged || gridChanged) && photos.length && pos >= 0 && !showing) {
      backLayer().cands = null; // descartar la vista ya preparada
      schedulePreload(50);
    }
    if (intervalChanged && pos >= 0) startTimer(opts.interval * 1000);
  }

  // Al girar el iPad: recolocar las celdas de las dos capas.
  function relayout() {
    for (var i = 0; i < layers.length; i++) {
      if (layers[i].state === 'ready' && layers[i].used) layout(layers[i]);
    }
  }

  function makeLayer(id) {
    var el = document.getElementById(id);
    var layer = { el: el, cells: [], gen: 0, state: null, cands: null, used: null, done: null, forced: false };
    for (var i = 0; i < 3; i++) {
      var cell = document.createElement('div');
      cell.className = 'cell hidden';
      var img = document.createElement('img');
      img.alt = '';
      var caption = document.createElement('div');
      caption.className = 'caption';
      cell.appendChild(img);
      cell.appendChild(caption);
      el.appendChild(cell);
      layer.cells.push({ el: cell, img: img, caption: caption });
    }
    return layer;
  }

  Frame.slideshow = {
    init: function (settings, showCallback) {
      layers = [makeLayer('layer-a'), makeLayer('layer-b')];
      emptyEl = document.getElementById('empty');
      onShow = showCallback || null;
      configure(settings);
    },
    configure: configure,
    setPhotos: setPhotos,
    update: update,
    setLoader: function (fn) { loader = fn; },
    setCaption: function (fn) { captionFn = fn; },
    // Rehace las leyendas visibles (por ejemplo, al cargar la tabla de ciudades).
    refreshCaption: function () {
      var layer = layers[front];
      if (layer && layer.state === 'ready' && layer.used) layout(layer);
    },
    relayout: relayout,
    next: forward,
    // Devuelve false si no hay nada más atrás.
    prev: back,
    setYearFn: function (fn) { yearFn = fn; },
    setComposer: function (fn) { composer = fn; },
    play: function () { playing = true; resume(); },
    pause: function () { playing = false; clearTimeout(timer); timer = null; },
    isPlaying: function () { return playing; },
    resume: resume,
    suspend: clearTimers
  };
})(window);
