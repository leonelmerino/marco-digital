/*
 * Gestor de preferencias: valores por defecto, validación y formulario.
 * Cada valor guardado se valida contra una lista cerrada; lo que no encaja
 * vuelve al valor por defecto, así una preferencia dañada no rompe la app.
 */
(function (global) {
  'use strict';

  var Frame = global.Frame = global.Frame || {};
  var STORAGE_KEY = 'settings.v1';

  var DEFAULTS = {
    interval: 30,
    order: 'random',
    transition: 'fade',
    fit: 'contain',
    grid: true,
    photoInfo: true,
    clockVisible: true,
    clockFormat: '24',
    clockSize: 'm',
    clockPosition: 'bottom-right',
    dateVisible: false,
    theme: 'normal',
    radioStation: Frame.radioStations.length ? Frame.radioStations[0].id : '',
    radioVolume: 80,
    dropboxRecursive: true,
    debug: false
  };

  var stationIds = [];
  for (var s = 0; s < Frame.radioStations.length; s++) stationIds.push(Frame.radioStations[s].id);

  var ALLOWED = {
    interval: [10, 15, 30, 60, 120, 300, 900],
    order: ['random', 'sequential'],
    transition: ['fade', 'none'],
    fit: ['contain', 'cover'],
    clockFormat: ['24', '12'],
    clockSize: ['s', 'm', 'l'],
    clockPosition: ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'center'],
    theme: ['normal', 'night'],
    radioStation: stationIds,
    radioVolume: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
  };

  var current = {};
  var listeners = [];

  function sanitize(source) {
    var result = {};
    var key;
    for (key in DEFAULTS) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) continue;
      var value = source && Object.prototype.hasOwnProperty.call(source, key) ? source[key] : DEFAULTS[key];
      if (typeof DEFAULTS[key] === 'boolean') {
        result[key] = value === true;
      } else if (typeof DEFAULTS[key] === 'number') {
        value = Number(value);
        result[key] = ALLOWED[key].indexOf(value) >= 0 ? value : DEFAULTS[key];
      } else {
        result[key] = ALLOWED[key].indexOf(value) >= 0 ? value : DEFAULTS[key];
      }
    }
    return result;
  }

  function load() {
    var stored = Frame.storage.read(STORAGE_KEY);
    if (!stored) Frame.compat.log('Sin preferencias guardadas; usando valores por defecto');
    current = sanitize(stored);
    return current;
  }

  function notify(changed) {
    for (var i = 0; i < listeners.length; i++) listeners[i](current, changed);
  }

  function set(key, value) {
    var next = {};
    for (var k in current) next[k] = current[k];
    next[key] = value;
    next = sanitize(next);
    if (next[key] === current[key]) return;
    current = next;
    Frame.storage.write(STORAGE_KEY, current);
    notify(key);
  }

  function reset() {
    Frame.storage.remove(STORAGE_KEY);
    current = sanitize(null);
    notify(null);
  }

  // ---- Formulario de configuración ----

  function fillForm(form) {
    for (var key in current) {
      var field = form.elements[key];
      if (!field) continue;
      if (field.type === 'checkbox') field.checked = current[key];
      else field.value = String(current[key]);
    }
  }

  function bindForm(form) {
    fillForm(form);
    form.addEventListener('change', function (event) {
      var field = event.target;
      if (!field.name || !Object.prototype.hasOwnProperty.call(DEFAULTS, field.name)) return;
      set(field.name, field.type === 'checkbox' ? field.checked : field.value);
    });
    onChange(function () { fillForm(form); });
  }

  function onChange(fn) { listeners.push(fn); }

  Frame.settings = {
    DEFAULTS: DEFAULTS,
    load: load,
    get: function () { return current; },
    set: set,
    reset: reset,
    onChange: onChange,
    bindForm: bindForm
  };
})(window);
