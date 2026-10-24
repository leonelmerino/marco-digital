/*
 * Reproductor de radio por internet con un único <audio>.
 *
 * - Safari no permite sonido automático: `play()` solo funciona si se llama
 *   dentro de un toque del usuario. Por eso la radio nunca arranca sola al
 *   cargar la página.
 * - En una señal en directo, pausar deja de tener sentido (al reanudar
 *   estaría atrasada), así que «detener» suelta la conexión y «reproducir»
 *   vuelve a conectar con la señal actual.
 * - En iOS el volumen de la página no se puede cambiar (`audio.volume` se
 *   ignora); se usan los botones del iPad.
 *
 * Estados: off, connecting, playing, blocked (falta un toque), error.
 */
(function (global) {
  'use strict';

  var Frame = global.Frame = global.Frame || {};

  var CONNECT_TIMEOUT_MS = 15000; // sin sonido tras este tiempo: probar otra vez
  var MAX_RETRIES = 3;

  var audio = null;
  var stations = [];
  var station = null;
  var wanted = false;      // el usuario quiere escuchar
  var urlIndex = 0;
  var retries = 0;
  var attemptId = 0;       // un fallo solo cuenta una vez por intento
  var failedAttempt = -1;
  var retryTimer = null;
  var watchdog = null;
  var state = { status: 'off', message: '', station: null };
  var listeners = [];

  function find(id) {
    for (var i = 0; i < stations.length; i++) if (stations[i].id === id) return stations[i];
    return stations[0] || null;
  }

  function setState(status, message) {
    state = { status: status, message: message || '', station: station };
    for (var i = 0; i < listeners.length; i++) listeners[i](state);
  }

  function clearTimers() {
    clearTimeout(retryTimer);
    clearTimeout(watchdog);
    retryTimer = null;
    watchdog = null;
  }

  function armWatchdog() {
    clearTimeout(watchdog);
    watchdog = setTimeout(function () {
      if (wanted && state.status === 'connecting') failed('sin respuesta');
    }, CONNECT_TIMEOUT_MS);
  }

  // Debe llamarse de forma síncrona dentro del toque para que iOS lo permita.
  function attempt() {
    if (!wanted || !station) return;
    var url = station.urls[urlIndex];
    var my = ++attemptId;
    setState('connecting', retries ? 'Reconectando…' : 'Conectando…');
    armWatchdog();
    audio.src = url;
    var promise = audio.play();
    if (promise && typeof promise.catch === 'function') {
      promise.catch(function (err) {
        if (!wanted || my !== attemptId) return;
        if (err && err.name === 'NotAllowedError') {
          clearTimers();
          setState('blocked', 'Toca ▶ para escuchar');
        } else if (err && err.name !== 'AbortError') {
          failed(err.name || 'error');
        }
      });
    }
  }

  function failed(reason) {
    // El evento `error` y el rechazo de play() suelen llegar juntos.
    if (!wanted || failedAttempt === attemptId) return;
    failedAttempt = attemptId;
    clearTimers();
    Frame.compat.log('Radio ' + station.name + ': fallo (' + reason + ') en la URL ' + (urlIndex + 1), true);
    if (urlIndex + 1 < station.urls.length) {
      urlIndex++;
      attempt();
      return;
    }
    if (retries < MAX_RETRIES) {
      retries++;
      urlIndex = 0;
      setState('connecting', 'Reconectando…');
      retryTimer = setTimeout(attempt, 2000 * retries);
      return;
    }
    release();
    setState('error', 'No se pudo conectar con ' + station.name);
  }

  function release() {
    audio.pause();
    audio.removeAttribute('src');
    try { audio.load(); } catch (e) { /* algunos navegadores lanzan sin src */ }
  }

  function bindAudio() {
    audio.addEventListener('playing', function () {
      if (!wanted) return;
      clearTimers();
      retries = 0;
      setState('playing', 'Sonando');
      Frame.compat.log('Radio ' + station.name + ': sonando (URL ' + (urlIndex + 1) + ')');
    });
    audio.addEventListener('waiting', function () {
      if (wanted && state.status === 'playing') {
        setState('connecting', 'Cargando…');
        armWatchdog();
      }
    });
    audio.addEventListener('error', function () {
      if (!wanted || !audio.getAttribute('src')) return;
      var code = audio.error ? audio.error.code : '?';
      failed('código ' + code);
    });
    // Una señal en directo no debería terminar: si termina, se cortó.
    audio.addEventListener('ended', function () { failed('señal terminada'); });
    // iOS puede pausar el audio (llamada, otra app con sonido).
    audio.addEventListener('pause', function () {
      if (wanted && state.status === 'playing') {
        setState('blocked', 'En pausa · toca ▶ para seguir');
      }
    });
  }

  // ---- API pública ----

  function play(id) {
    clearTimers();
    station = find(id || (station && station.id));
    if (!station) return;
    wanted = true;
    urlIndex = 0;
    retries = 0;
    attempt();
  }

  function stop() {
    wanted = false;
    clearTimers();
    release();
    setState('off', '');
  }

  function resume() {
    // Al volver a primer plano: si el usuario quería escuchar y se cortó.
    if (wanted && audio.paused && state.status !== 'connecting') {
      var promise = audio.play();
      if (promise && typeof promise.catch === 'function') {
        promise.catch(function () { setState('blocked', 'Toca ▶ para escuchar'); });
      }
    }
  }

  Frame.radio = {
    init: function (stationList, initialId) {
      stations = stationList;
      audio = document.getElementById('radio-audio');
      station = find(initialId);
      bindAudio();
      setState('off', '');
    },
    play: play,
    stop: stop,
    toggle: function () { if (wanted && state.status !== 'blocked' && state.status !== 'error') stop(); else play(); },
    resume: resume,
    isOn: function () { return wanted; },
    setVolume: function (percent) { if (audio) audio.volume = Math.max(0, Math.min(1, percent / 100)); },
    getState: function () { return state; },
    onChange: function (fn) { listeners.push(fn); }
  };
})(window);
