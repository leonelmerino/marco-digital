/*
 * Arranque e interfaz: une preferencias, reloj y presentación, y gestiona
 * controles, configuración, conectividad y vuelta a primer plano.
 */
(function (global) {
  'use strict';

  var Frame = global.Frame;
  var CONTROLS_HIDE_MS = 5000;
  var HEARTBEAT_MS = 15 * 60 * 1000;

  var body = document.body;
  var hideTimer = null;
  var startedAt = Date.now();
  var lastPhoto = '';

  function $(id) { return document.getElementById(id); }

  function setBodyClass(name, on) {
    var classes = body.className.split(/\s+/);
    var idx = classes.indexOf(name);
    if (on && idx < 0) classes.push(name);
    if (!on && idx >= 0) classes.splice(idx, 1);
    body.className = classes.join(' ').replace(/^\s+|\s+$/g, '');
  }

  function applyVisualSettings(s) {
    setBodyClass('fit-cover', s.fit === 'cover');
    setBodyClass('transition-none', s.transition === 'none');
    setBodyClass('theme-night', s.theme === 'night');
    Frame.compat.setDebugVisible(s.debug);
  }

  // ---- Controles ----

  function controlsVisible() { return body.className.indexOf('controls-visible') >= 0; }

  function showControls() {
    setBodyClass('controls-visible', true);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideControls, CONTROLS_HIDE_MS);
  }

  function hideControls() {
    clearTimeout(hideTimer);
    setBodyClass('controls-visible', false);
  }

  function updatePlayButton() {
    var btn = $('btn-play');
    var playing = Frame.slideshow.isPlaying();
    btn.innerHTML = playing ? '&#10074;&#10074;' : '&#9654;';
    btn.setAttribute('aria-label', playing ? 'Pausar' : 'Reanudar');
  }

  function bindControls() {
    $('stage').addEventListener('click', function () {
      if (controlsVisible()) hideControls(); else showControls();
    });
    $('btn-prev').addEventListener('click', function () { Frame.slideshow.prev(); showControls(); });
    $('btn-next').addEventListener('click', function () { Frame.slideshow.next(); showControls(); });
    $('btn-play').addEventListener('click', function () {
      if (Frame.slideshow.isPlaying()) Frame.slideshow.pause(); else Frame.slideshow.play();
      updatePlayButton();
      showControls();
    });
    $('btn-settings').addEventListener('click', openSettings);
  }

  // ---- Configuración ----

  function updateDiagnostics() {
    var minutes = Math.floor((Date.now() - startedAt) / 60000);
    $('diag-summary').innerHTML =
      Frame.compat.summary() + '<br>' +
      'Conexión: ' + (navigator.onLine ? 'en línea' : 'sin conexión') +
      ' · Abierta hace ' + minutes + ' min' +
      (lastPhoto ? ' · Foto actual: ' + lastPhoto : '');
  }

  function openSettings() {
    hideControls();
    updateDiagnostics();
    $('settings').className = 'settings';
  }

  function closeSettings() {
    $('settings').className = 'settings hidden';
  }

  function bindSettings() {
    Frame.settings.bindForm($('settings-form'));
    $('btn-close').addEventListener('click', closeSettings);
    $('settings').addEventListener('click', function (event) {
      if (event.target === $('settings')) closeSettings(); // toque fuera del panel
    });
    $('btn-reload').addEventListener('click', function () { global.location.reload(); });
    $('btn-reset').addEventListener('click', function () {
      if (global.confirm('¿Restablecer todas las preferencias?')) Frame.settings.reset();
    });
  }

  // ---- Conectividad y ciclo de vida ----

  function updateConnectivity() {
    var status = $('status');
    if (navigator.onLine) {
      status.className = 'status hidden';
    } else {
      status.textContent = 'Sin conexión';
      status.className = 'status';
    }
  }

  function onForeground() {
    Frame.compat.log('Página visible de nuevo');
    Frame.clock.refresh();
    Frame.slideshow.resume();
    updateConnectivity();
  }

  function bindLifecycle() {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        Frame.compat.log('Página en segundo plano');
        Frame.slideshow.suspend();
      } else {
        onForeground();
      }
    });
    // iOS puede restaurar la página desde la caché de navegación sin recargarla.
    global.addEventListener('pageshow', function (event) {
      if (event.persisted) onForeground();
    });
    global.addEventListener('online', function () { Frame.compat.log('En línea'); updateConnectivity(); });
    global.addEventListener('offline', function () { Frame.compat.log('Sin conexión', true); updateConnectivity(); });
    global.addEventListener('orientationchange', function () { Frame.compat.log('Cambio de orientación'); });

    // Latido para las pruebas prolongadas: deja constancia en el diagnóstico.
    setInterval(function () {
      var minutes = Math.round((Date.now() - startedAt) / 60000);
      Frame.compat.log('Sigue activa: ' + minutes + ' min');
    }, HEARTBEAT_MS);
  }

  // ---- Arranque ----

  function start() {
    var settings = Frame.settings.load();
    applyVisualSettings(settings);
    Frame.compat.log(Frame.compat.summary());

    Frame.clock.init(settings);
    Frame.slideshow.init(settings, function (photo) { lastPhoto = photo.name; });

    Frame.settings.onChange(function (s) {
      applyVisualSettings(s);
      Frame.clock.configure(s);
      Frame.slideshow.configure(s);
    });

    bindControls();
    bindSettings();
    bindLifecycle();
    updateConnectivity();
    updatePlayButton();

    Frame.slideshow.setPhotos(Frame.samplePhotos);
    showControls();
  }

  start();
})(window);
