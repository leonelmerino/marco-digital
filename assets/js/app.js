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
    $('btn-radio').addEventListener('click', openRadio);
  }

  // ---- Radio ----

  function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderStations() {
    var html = '';
    var list = Frame.radioStations;
    for (var i = 0; i < list.length; i++) {
      html += '<button type="button" class="station" data-id="' + list[i].id + '">' +
        '<span class="station-name">' + escapeHtml(list[i].name) + '</span>' +
        '<span class="station-meta">' + escapeHtml(list[i].freq + ' · ' + list[i].genre) + '</span>' +
        '</button>';
    }
    $('radio-stations').innerHTML = html;
  }

  function updateRadioUI(state) {
    var selected = Frame.settings.get().radioStation;
    var station = state.station;
    var label = station ? station.name + ' ' + station.freq : '';
    var isError = state.status === 'error';

    $('radio-station-name').textContent = label;
    $('radio-status').textContent = state.status === 'off' ? 'Apagada' : state.message;
    $('radio-status').className = isError ? 'radio-status error' : 'radio-status';

    var on = Frame.radio.isOn() && state.status !== 'blocked' && !isError;
    var toggle = $('btn-radio-toggle');
    toggle.innerHTML = on ? '&#9632;' : '&#9654;';
    toggle.className = on ? 'radio-toggle on' : 'radio-toggle';
    toggle.setAttribute('aria-label', on ? 'Detener' : 'Escuchar');

    // Con la radio encendida se marca la que suena (también al escanear).
    var highlighted = state.status !== 'off' && station ? station.id : selected;
    var buttons = $('radio-stations').getElementsByTagName('button');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].className = buttons[i].getAttribute('data-id') === highlighted ? 'station active' : 'station';
    }

    var scan = $('btn-scan');
    scan.innerHTML = state.scanning ? 'Quedarme aquí' : '&#8635; Escanear';
    scan.className = state.scanning ? 'radio-scan on' : 'radio-scan';

    var now = $('radio-now');
    if (state.status === 'off') {
      now.className = 'radio-now hidden';
    } else {
      now.textContent = '♪ ' + (state.scanning ? 'Escaneando · ' + label : label + ' · ' + state.message);
      now.className = isError ? 'radio-now error' : 'radio-now';
    }
    // Avisar aunque los controles estén ocultos.
    if (isError || state.status === 'blocked') showControls();
  }

  function stopScanHere() {
    Frame.radio.stopScan();
    var station = Frame.radio.getState().station;
    if (station) Frame.settings.set('radioStation', station.id);
  }

  function openRadio() {
    hideControls();
    $('radio-sheet').className = 'settings';
  }

  function closeRadio() {
    $('radio-sheet').className = 'settings hidden';
  }

  function bindRadio(settings) {
    renderStations();
    Frame.radio.init(Frame.radioStations, settings.radioStation);
    Frame.radio.setVolume(settings.radioVolume);
    Frame.radio.onChange(updateRadioUI);
    updateRadioUI(Frame.radio.getState());

    // play() tiene que ocurrir dentro del toque para que iOS permita el sonido.
    $('radio-stations').addEventListener('click', function (event) {
      var button = event.target.closest ? event.target.closest('.station') : null;
      if (!button) return;
      var id = button.getAttribute('data-id');
      Frame.settings.set('radioStation', id);
      Frame.radio.play(id);
    });
    $('btn-radio-toggle').addEventListener('click', function () {
      if (!Frame.radio.isOn()) Frame.radio.play(Frame.settings.get().radioStation);
      else Frame.radio.toggle();
    });
    $('btn-scan').addEventListener('click', function () {
      if (Frame.radio.isScanning()) stopScanHere();
      else Frame.radio.startScan();
    });

    // Durante el escaneo, cualquier toque lo detiene y deja sonando la estación
    // actual. Se escucha en fase de captura, antes que el botón tocado. Cerrar
    // la ventana de radio no cuenta, para poder volver a las fotos escaneando.
    document.addEventListener('click', function (event) {
      if (!Frame.radio.isScanning()) return;
      var target = event.target;
      if (target === $('radio-sheet')) return;
      if (target.closest && target.closest('#btn-scan, #btn-radio-close')) return;
      stopScanHere();
    }, true);

    $('btn-radio-close').addEventListener('click', closeRadio);
    $('radio-sheet').addEventListener('click', function (event) {
      if (event.target === $('radio-sheet')) closeRadio();
    });

    // En iOS la página no puede cambiar el volumen: se oculta el control.
    if (Frame.compat.features.ios) {
      $('radio-volume-row').className = 'row hidden';
      $('radio-volume-note').className = 'note';
    } else {
      var volume = $('radio-volume');
      volume.value = String(settings.radioVolume);
      volume.addEventListener('input', function () { Frame.radio.setVolume(Number(volume.value)); });
      volume.addEventListener('change', function () { Frame.settings.set('radioVolume', Number(volume.value)); });
    }
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
    Frame.radio.resume();
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
    bindRadio(settings);
    bindLifecycle();
    updateConnectivity();
    updatePlayButton();

    Frame.slideshow.setPhotos(Frame.samplePhotos);
    showControls();
  }

  start();
})(window);
