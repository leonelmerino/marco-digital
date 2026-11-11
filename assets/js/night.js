/*
 * Modo noche y despertador.
 *
 * Una página no puede despertar a un iPad bloqueado ni encender su pantalla:
 * el iPad tiene que quedar enchufado, con Bloqueo automático en «Nunca» y
 * con el marco al frente. Por eso el despertador funciona así:
 *
 * 1. «Dormir» (un toque): detiene la radio y las fotos, deja la pantalla en
 *    negro con un reloj tenue y, dentro de ese toque, habilita los <audio>
 *    (iOS solo deja sonar audio después de un toque; reproducir un silencio
 *    corto deja cada <audio> habilitado para después).
 * 2. Amanecer: unos minutos antes, las fotos vuelven a aparecer poco a poco
 *    (la capa negra se desvanece). La página no puede subir el brillo.
 * 3. A la hora: suena la radio elegida. Si en 15 s no suena (sin red,
 *    emisora caída) o falla después, suena el tono incluido en la app.
 * 4. «Posponer 5 min» (las veces que se quiera) o «Apagar».
 *
 * El estado se guarda: si la página se recarga de noche, vuelve al modo
 * noche (pero hasta el siguiente toque quizás no pueda sonar; lo avisa).
 * Un reloj de 5 s compara con la hora real, así un temporizador atrasado no
 * retrasa la alarma.
 */
(function (global) {
  'use strict';

  var Frame = global.Frame = global.Frame || {};

  var STORAGE_KEY = 'alarm.sleep';
  var SILENT_URL = 'assets/sounds/silence.wav';
  var TONE_URL = 'assets/sounds/alarm.wav';
  var TICK_MS = 5000;
  var SNOOZE_MS = 5 * 60 * 1000;
  var RADIO_GRACE_MS = 15000;     // sin radio tras esto: tono
  var RING_MAX_MS = 60 * 60 * 1000;
  var LATE_MAX_MS = 2 * 60 * 60 * 1000; // más tarde que esto ya no suena
  var EXIT_SHOWN_MS = 6000;

  var state = 'awake';     // awake | sleeping | sunrise | ringing | snoozed
  var alarmAt = 0;         // ms
  var sunriseMin = 10;
  var station = '';
  var unlocked = false;
  var ringStart = 0;
  var graceTimer = null;
  var exitTimer = null;
  var resumePhotos = true;
  var hooks = {};

  function $(id) { return document.getElementById(id); }

  function log(text, isError) { Frame.compat.log('Despertador: ' + text, isError); }

  function setBody(name, on) {
    var cls = document.body.className.split(/\s+/).filter(function (c) { return c && c !== name; });
    if (on) cls.push(name);
    document.body.className = cls.join(' ');
  }

  function persist() {
    if (state === 'awake') Frame.storage.remove(STORAGE_KEY);
    else Frame.storage.write(STORAGE_KEY, { at: alarmAt, sunrise: sunriseMin, station: station, state: state });
  }

  // ---- Sonido ----

  function tone() { return $('alarm-tone'); }

  function unlockAudio() {
    Frame.radio.unlock(SILENT_URL);
    var el = tone();
    el.loop = false;
    el.src = SILENT_URL;
    var promise = el.play();
    if (promise && typeof promise.catch === 'function') promise.catch(function () { /* se verá al sonar */ });
    unlocked = true;
  }

  function playTone() {
    if (state !== 'ringing') return;
    var el = tone();
    if (!el.paused && el.getAttribute('src') === TONE_URL) return;
    log('suena el tono de respaldo');
    Frame.radio.stop();
    el.loop = true;
    el.src = TONE_URL;
    var promise = el.play();
    if (promise && typeof promise.catch === 'function') {
      promise.catch(function (err) {
        log('el iPad no dejó sonar el tono (' + err.name + ')', true);
        $('ring-note').textContent = 'El iPad no dejó sonar la alarma: toca la pantalla.';
      });
    }
  }

  function silence() {
    clearTimeout(graceTimer);
    var el = tone();
    el.pause();
    el.removeAttribute('src');
    try { el.load(); } catch (e) { /* sin src */ }
    Frame.radio.stop();
  }

  // ---- Pantalla ----

  function render() {
    var night = $('night');
    var sleeping = state === 'sleeping' || state === 'sunrise';
    night.className = sleeping ? 'night' + (state === 'sunrise' ? ' fading' : '') : 'night hidden';
    setBody('sleeping', state === 'sleeping');
    var info = '⏰ ' + Frame.alarm.describe(new Date(alarmAt));
    var st = Frame.radioStations.filter(function (s) { return s.id === station; })[0];
    if (st) info += ' · ' + st.name;
    if (!unlocked) info += ' · toca la pantalla para habilitar el sonido';
    $('night-info').textContent = info;

    var ring = $('ring');
    if (state === 'ringing') {
      ring.className = 'ring';
      $('ring-time').textContent = Frame.alarm.formatTime(new Date());
    } else if (state === 'snoozed') {
      ring.className = 'ring snoozed';
      $('ring-time').textContent = '⏰ ' + Frame.alarm.formatTime(new Date(alarmAt));
    } else {
      ring.className = 'ring hidden';
    }
    if (hooks.onChange) hooks.onChange();
  }

  function startSunrise() {
    state = 'sunrise';
    var remaining = Math.max(1000, alarmAt - Date.now());
    var night = $('night');
    // El desvanecimiento dura justo lo que falta para la alarma.
    night.style.webkitTransitionDuration = night.style.transitionDuration = (remaining / 1000) + 's';
    Frame.slideshow.play();
    render();
    log('amanecer: ' + Math.round(remaining / 60000) + ' min');
  }

  // ---- Estados ----

  function ring() {
    state = 'ringing';
    ringStart = Date.now();
    $('ring-note').textContent = '';
    Frame.slideshow.play();
    render();
    persist();
    log('suena (' + station + ')');
    Frame.radio.play(station);
    clearTimeout(graceTimer);
    graceTimer = setTimeout(function () {
      if (state === 'ringing' && Frame.radio.getState().status !== 'playing') playTone();
    }, RADIO_GRACE_MS);
  }

  function sleep(at, sunrise, stationId) {
    alarmAt = at.getTime();
    sunriseMin = sunrise;
    station = stationId;
    unlockAudio();
    Frame.radio.stop();
    resumePhotos = Frame.slideshow.isPlaying();
    Frame.slideshow.pause();
    state = 'sleeping';
    var night = $('night');
    night.style.webkitTransitionDuration = night.style.transitionDuration = '';
    render();
    persist();
    log('a dormir; alarma ' + Frame.alarm.describe(at));
    tick();
  }

  function wake() {
    clearTimeout(exitTimer);
    silence();
    state = 'awake';
    $('btn-night-exit').className = 'btn-night-exit hidden';
    render();
    persist();
    if (resumePhotos || !Frame.slideshow.isPlaying()) Frame.slideshow.play();
  }

  function snooze() {
    silence();
    alarmAt = Date.now() + SNOOZE_MS;
    state = 'snoozed';
    render();
    persist();
    log('pospuesta hasta ' + Frame.alarm.formatTime(new Date(alarmAt)));
  }

  function tick() {
    var now = Date.now();
    if (state === 'awake') return;
    if (state === 'ringing') {
      $('ring-time').textContent = Frame.alarm.formatTime(new Date());
      if (now - ringStart > RING_MAX_MS) { log('una hora sonando: se apaga'); wake(); }
      return;
    }
    if (now >= alarmAt + LATE_MAX_MS) {
      // La página estuvo congelada: ya no tiene sentido sonar.
      log('la alarma ' + Frame.alarm.formatTime(new Date(alarmAt)) + ' pasó sin sonar', true);
      wake();
      return;
    }
    if (now >= alarmAt) { ring(); return; }
    if (state === 'sleeping' && sunriseMin && now >= alarmAt - sunriseMin * 60000) startSunrise();
  }

  // ---- Enlaces ----

  function bind() {
    // Toque sobre la noche: vuelve a habilitar el sonido y ofrece salir.
    $('night').addEventListener('click', function () {
      if (!unlocked) { unlockAudio(); render(); }
      $('btn-night-exit').className = 'btn-night-exit';
      clearTimeout(exitTimer);
      exitTimer = setTimeout(function () { $('btn-night-exit').className = 'btn-night-exit hidden'; }, EXIT_SHOWN_MS);
    });
    $('btn-night-exit').addEventListener('click', function (event) {
      event.stopPropagation();
      log('modo noche cancelado');
      wake();
    });
    $('btn-snooze').addEventListener('click', snooze);
    $('btn-dismiss').addEventListener('click', function () { log('apagada'); wake(); });
    // Si la radio falla mientras suena la alarma, el tono la reemplaza.
    Frame.radio.onChange(function (s) {
      if (state === 'ringing' && (s.status === 'error' || s.status === 'blocked')) playTone();
    });
  }

  function init(options) {
    hooks = options || {};
    bind();
    setInterval(tick, TICK_MS);
    var saved = Frame.storage.read(STORAGE_KEY);
    if (saved && typeof saved.at === 'number' && Date.now() < saved.at + LATE_MAX_MS) {
      // Recarga durante la noche: seguir esperando la alarma.
      alarmAt = saved.at;
      sunriseMin = Number(saved.sunrise) || 0;
      station = saved.station || '';
      unlocked = false;
      Frame.slideshow.pause();
      state = saved.state === 'snoozed' ? 'snoozed' : 'sleeping';
      log('modo noche recuperado tras recargar', true);
      render();
      tick();
    } else if (saved) {
      Frame.storage.remove(STORAGE_KEY);
    }
  }

  Frame.night = {
    init: init,
    sleep: sleep,
    wake: wake,
    tick: tick,
    state: function () { return state; },
    alarmAt: function () { return state === 'awake' ? 0 : alarmAt; }
  };
})(window);
