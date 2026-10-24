/*
 * Compatibilidad y diagnóstico.
 * Debe cargarse primero: captura errores de los demás scripts y los muestra
 * en pantalla, porque en el iPad no siempre hay un inspector disponible.
 *
 * Sintaxis limitada a ES2017 (Safari 12): nada de `?.`, `??` ni campos de clase.
 */
(function (global) {
  'use strict';

  var Frame = global.Frame = global.Frame || {};

  var MAX_LINES = 40;
  var lines = [];
  var panel = null;
  var enabled = false;

  function timestamp() {
    var d = new Date();
    function p(n) { return n < 10 ? '0' + n : String(n); }
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function render() {
    if (!panel || !enabled) return;
    var html = '';
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var text = line.text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      html += line.error ? '<span class="err">' + text + '</span>\n' : text + '\n';
    }
    panel.innerHTML = html;
  }

  function log(message, isError) {
    lines.push({ text: timestamp() + ' ' + message, error: !!isError });
    if (lines.length > MAX_LINES) lines.shift();
    if (global.console) {
      (isError ? console.error : console.log).call(console, '[marco] ' + message);
    }
    render();
  }

  global.addEventListener('error', function (event) {
    var where = event.filename ? ' (' + event.filename.split('/').pop() + ':' + event.lineno + ')' : '';
    log('Error: ' + event.message + where, true);
  });
  global.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason && event.reason.message ? event.reason.message : String(event.reason);
    log('Promesa rechazada: ' + reason, true);
  });

  function iosVersion() {
    var m = /OS (\d+)_(\d+)_?(\d+)? like Mac OS X/.exec(navigator.userAgent);
    return m ? m[1] + '.' + m[2] + (m[3] ? '.' + m[3] : '') : null;
  }

  function storageAvailable() {
    try {
      var key = '__marco_test__';
      global.localStorage.setItem(key, '1');
      global.localStorage.removeItem(key);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Detección de capacidades que el proyecto usa o usará. Nada se da por hecho.
  var features = {
    ios: iosVersion(),
    standalone: !!navigator.standalone,
    localStorage: storageAvailable(),
    objectFit: 'objectFit' in document.documentElement.style,
    fetch: typeof global.fetch === 'function',
    promise: typeof global.Promise === 'function',
    visibility: typeof document.hidden !== 'undefined',
    cryptoSubtle: !!(global.crypto && global.crypto.subtle),
    serviceWorker: 'serviceWorker' in navigator
  };

  function summary() {
    var parts = [];
    parts.push(features.ios ? 'iOS ' + features.ios : 'No es iOS');
    parts.push(features.standalone ? 'pantalla de inicio' : 'pestaña de Safari');
    parts.push('localStorage: ' + (features.localStorage ? 'sí' : 'no'));
    parts.push('object-fit: ' + (features.objectFit ? 'sí' : 'no'));
    parts.push('fetch: ' + (features.fetch ? 'sí' : 'no'));
    parts.push('crypto.subtle: ' + (features.cryptoSubtle ? 'sí' : 'no'));
    parts.push('pantalla: ' + screen.width + '×' + screen.height + ' @' + (global.devicePixelRatio || 1) + 'x');
    return parts.join(' · ');
  }

  Frame.compat = {
    features: features,
    summary: summary,
    log: log,
    setDebugVisible: function (visible) {
      enabled = !!visible;
      panel = panel || document.getElementById('debug');
      if (!panel) return;
      panel.className = enabled ? 'debug' : 'debug hidden';
      render();
    }
  };
})(window);
