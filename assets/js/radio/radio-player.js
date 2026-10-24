/*
 * Reproductor de radio por internet con dos <audio> («canales»).
 *
 * - Safari no permite sonido automático: `play()` solo funciona si se llama
 *   dentro de un toque del usuario. Por eso la radio nunca arranca sola al
 *   cargar la página. Cada <audio> queda habilitado tras su primer `play()`
 *   dentro de un toque; después se le puede cambiar la señal sin toque.
 * - En una señal en directo, pausar deja de tener sentido (al reanudar
 *   estaría atrasada), así que «detener» suelta la conexión y «reproducir»
 *   vuelve a conectar con la señal actual.
 * - En iOS el volumen de la página no se puede cambiar (`audio.volume` se
 *   ignora); se usan los botones del iPad. `muted` sí funciona.
 *
 * - Escanear: recorre las estaciones en bucle. Mientras una suena, el otro
 *   canal conecta la siguiente en silencio; el cambio se hace cuando la actual
 *   ya sonó SCAN_LISTEN_MS y la siguiente ya tiene sonido, así no hay silencio
 *   entre estaciones. Las que no conectan se saltan sin reintentos. Si el
 *   iPad no deja sonar dos <audio> a la vez, se usa un solo canal (con un
 *   breve silencio en cada cambio). Cualquier acción del usuario lo detiene.
 *
 * Estados: off, connecting, playing, blocked (falta un toque), error.
 */
(function (global) {
  'use strict';

  var Frame = global.Frame = global.Frame || {};

  var CONNECT_TIMEOUT_MS = 15000; // sin sonido tras este tiempo: probar otra vez
  var MAX_RETRIES = 3;
  var SCAN_LISTEN_MS = 5000;      // tiempo que suena cada estación al escanear
  var SCAN_CONNECT_MS = 8000;     // al escanear, saltar la que tarda más que esto

  var stations = [];
  var channels = [];
  var main = null;         // canal que se oye
  var next = null;         // al escanear: canal que conecta la siguiente, en silencio
  var wanted = false;      // el usuario quiere escuchar
  var retries = 0;
  var retryTimer = null;
  var scanning = false;
  var scanTimer = null;
  var listenDone = false;  // la estación actual ya sonó su turno (o falló)
  var gapless = true;      // false si el iPad no deja sonar dos <audio> a la vez
  var volume = 1;
  var state = { status: 'off', message: '', station: null, scanning: false };
  var listeners = [];

  function log(text, isError) { Frame.compat.log(text, isError); }

  function find(id) {
    for (var i = 0; i < stations.length; i++) if (stations[i].id === id) return stations[i];
    return stations[0] || null;
  }

  function following(station) {
    return stations[(stations.indexOf(station) + 1) % stations.length];
  }

  function setState(status, message) {
    state = { status: status, message: message || '', station: main.station, scanning: scanning };
    for (var i = 0; i < listeners.length; i++) listeners[i](state);
  }

  // ---- Canales ----

  function makeChannel(el) {
    var ch = { el: el, station: null, urlIndex: 0, attemptId: 0, failedAttempt: -1, watchdog: null, live: false };
    bindChannel(ch);
    return ch;
  }

  function other(ch) { return ch === channels[0] ? channels[1] : channels[0]; }

  function inUse(ch) { return wanted && (ch === main || ch === next); }

  function arm(ch) {
    var my = ch.attemptId;
    clearTimeout(ch.watchdog);
    ch.watchdog = setTimeout(function () {
      if (my === ch.attemptId && !ch.live) fail(ch, 'sin respuesta');
    }, scanning ? SCAN_CONNECT_MS : CONNECT_TIMEOUT_MS);
  }

  // Para el canal principal debe llamarse dentro del toque la primera vez.
  function load(ch, muted) {
    var my = ++ch.attemptId;
    ch.live = false;
    arm(ch);
    ch.el.muted = muted;
    ch.el.volume = volume;
    ch.el.src = ch.station.urls[ch.urlIndex];
    var promise = ch.el.play();
    if (promise && typeof promise.catch === 'function') {
      promise.catch(function (err) {
        if (my !== ch.attemptId || !inUse(ch)) return;
        if (err && err.name === 'NotAllowedError') blocked(ch);
        else if (err && err.name !== 'AbortError') fail(ch, err.name || 'error');
      });
    }
  }

  function release(ch) {
    ch.attemptId++; // descarta eventos y promesas pendientes
    ch.live = false;
    clearTimeout(ch.watchdog);
    ch.el.pause();
    ch.el.removeAttribute('src');
    try { ch.el.load(); } catch (e) { /* algunos navegadores lanzan sin src */ }
  }

  function connectMain() {
    setState('connecting', scanning ? 'Escaneando…' : retries ? 'Reconectando…' : 'Conectando…');
    load(main, false);
  }

  function blocked(ch) {
    if (ch === next) {
      // El segundo <audio> no quedó habilitado: escanear con un solo canal.
      log('Radio: el iPad no deja precargar en silencio; escaneo con un canal', true);
      gapless = false;
      release(next);
      next = null;
      advance();
      return;
    }
    clearTimeout(retryTimer);
    endScan();
    setState('blocked', 'Toca ▶ para escuchar');
  }

  function fail(ch, reason) {
    // El evento `error` y el rechazo de play() suelen llegar juntos.
    if (!inUse(ch) || ch.failedAttempt === ch.attemptId) return;
    ch.failedAttempt = ch.attemptId;
    ch.live = false;
    clearTimeout(ch.watchdog);
    log('Radio ' + ch.station.name + (ch === next ? ' (precarga)' : '') +
      ': fallo (' + reason + ') en la URL ' + (ch.urlIndex + 1), true);
    if (ch.urlIndex + 1 < ch.station.urls.length) {
      ch.urlIndex++;
      if (ch === main) connectMain(); else load(ch, true);
      return;
    }
    if (ch === next) {
      preload(following(ch.station)); // se salta y se precarga la siguiente
      return;
    }
    if (scanning) {
      listenDone = true; // al escanear no se insiste: se pasa a la siguiente
      setState('connecting', 'Escaneando…');
      advance();
      return;
    }
    if (retries < MAX_RETRIES) {
      retries++;
      main.urlIndex = 0;
      setState('connecting', 'Reconectando…');
      retryTimer = setTimeout(connectMain, 2000 * retries);
      return;
    }
    release(main);
    setState('error', 'No se pudo conectar con ' + main.station.name);
  }

  function onMainLive() {
    clearTimeout(retryTimer);
    retries = 0;
    if (scanning) {
      listenDone = false;
      clearTimeout(scanTimer);
      scanTimer = setTimeout(function () { listenDone = true; advance(); }, SCAN_LISTEN_MS);
    }
    setState('playing', scanning ? 'Escaneando…' : 'Sonando');
    log('Radio ' + main.station.name + ': sonando (URL ' + (main.urlIndex + 1) + ')');
  }

  function bindChannel(ch) {
    var el = ch.el;
    el.addEventListener('playing', function () {
      if (!inUse(ch)) return;
      ch.live = true;
      clearTimeout(ch.watchdog);
      if (ch === main) onMainLive();
      else advance(); // la siguiente ya suena en silencio
    });
    el.addEventListener('waiting', function () {
      if (!inUse(ch) || !ch.live) return;
      ch.live = false;
      arm(ch);
      if (ch === main) setState('connecting', 'Cargando…');
    });
    el.addEventListener('error', function () {
      if (!el.getAttribute('src')) return;
      fail(ch, 'código ' + (el.error ? el.error.code : '?'));
    });
    // Una señal en directo no debería terminar: si termina, se cortó.
    el.addEventListener('ended', function () { fail(ch, 'señal terminada'); });
    el.addEventListener('pause', function () {
      if (!inUse(ch) || ch !== main || state.status !== 'playing') return;
      if (scanning && next) {
        // Al empezar el segundo <audio>, iOS pausó el primero.
        log('Radio: el iPad no deja sonar dos señales a la vez; escaneo con un canal', true);
        gapless = false;
        main.live = false;
        listenDone = true;
        setState('connecting', 'Escaneando…');
        advance();
        return;
      }
      // iOS puede pausar el audio (llamada, otra app con sonido).
      endScan();
      setState('blocked', 'En pausa · toca ▶ para seguir');
    });
  }

  // ---- Escaneo ----

  function preload(station) {
    if (!scanning || !gapless || stations.length < 2) return;
    if (station === main.station) station = following(station);
    next = other(main);
    next.station = station;
    next.urlIndex = 0;
    load(next, true);
  }

  // La siguiente pasa a sonar: se quita el silencio y se suelta la anterior.
  function promote() {
    var old = main;
    main = next;
    next = null;
    main.el.muted = false;
    release(old);
    onMainLive();
    preload(following(main.station));
  }

  // Avanza cuando la actual ya cumplió su turno.
  function advance() {
    if (!scanning || !listenDone) return;
    if (next) {
      if (next.live) promote(); // si no, se espera a que tenga sonido
      return;
    }
    if (gapless) {
      preload(following(main.station));
      return;
    }
    // Un solo canal: se cambia la señal y hay un silencio mientras conecta.
    main.station = following(main.station);
    main.urlIndex = 0;
    listenDone = false;
    connectMain();
  }

  function endScan() {
    scanning = false;
    listenDone = false;
    clearTimeout(scanTimer);
    scanTimer = null;
    if (next) {
      release(next);
      next = null;
    }
  }

  // Debe llamarse dentro de un toque: habilita el segundo <audio>.
  function startScan() {
    if (!stations.length) return;
    clearTimeout(retryTimer);
    var wasPlaying = wanted && main.live;
    scanning = true;
    wanted = true;
    retries = 0;
    if (wasPlaying) {
      listenDone = true; // pasar a la siguiente en cuanto tenga sonido
      setState('playing', 'Escaneando…');
      advance();
    } else {
      listenDone = false;
      main.urlIndex = 0;
      connectMain(); // empezar por la estación actual
      preload(following(main.station));
    }
  }

  // Detener el escaneo y quedarse en la estación que está sonando.
  function stopScan() {
    if (!scanning) return;
    if (next && next.live && !main.live) {
      var old = main;
      main = next;
      next = null;
      main.el.muted = false;
      release(old);
    }
    endScan();
    if (main.live) {
      setState('playing', 'Sonando');
    } else {
      retries = 0;
      main.urlIndex = 0;
      connectMain();
    }
  }

  // ---- API pública ----

  function play(id) {
    endScan();
    clearTimeout(retryTimer);
    main.station = find(id || (main.station && main.station.id));
    if (!main.station) return;
    wanted = true;
    retries = 0;
    main.urlIndex = 0;
    connectMain();
  }

  function stop() {
    endScan();
    wanted = false;
    clearTimeout(retryTimer);
    release(main);
    setState('off', '');
  }

  function resume() {
    // Al volver a primer plano: si el usuario quería escuchar y se cortó.
    if (wanted && main.el.paused && state.status !== 'connecting') {
      var promise = main.el.play();
      if (promise && typeof promise.catch === 'function') {
        promise.catch(function () { setState('blocked', 'Toca ▶ para escuchar'); });
      }
    }
  }

  Frame.radio = {
    init: function (stationList, initialId) {
      stations = stationList;
      channels = [
        makeChannel(document.getElementById('radio-audio')),
        makeChannel(document.getElementById('radio-audio-2'))
      ];
      main = channels[0];
      main.station = find(initialId);
      setState('off', '');
    },
    play: play,
    stop: stop,
    startScan: startScan,
    stopScan: stopScan,
    isScanning: function () { return scanning; },
    toggle: function () { if (wanted && state.status !== 'blocked' && state.status !== 'error') stop(); else play(); },
    resume: resume,
    isOn: function () { return wanted; },
    setVolume: function (percent) {
      volume = Math.max(0, Math.min(1, percent / 100));
      for (var i = 0; i < channels.length; i++) channels[i].el.volume = volume;
    },
    getState: function () { return state; },
    onChange: function (fn) { listeners.push(fn); }
  };
})(window);
