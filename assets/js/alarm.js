/*
 * Despertador: horarios guardados y cálculo de la próxima alarma.
 *
 * Dos horarios: lunes a viernes y fin de semana, cada uno con su hora y su
 * interruptor. Se guarda en localStorage aparte de las preferencias (que
 * solo admiten listas cerradas); un valor dañado vuelve a los de por defecto.
 */
(function (global) {
  'use strict';

  var Frame = global.Frame = global.Frame || {};
  var STORAGE_KEY = 'alarm.v1';

  var DEFAULTS = {
    weekday: { on: true, time: '07:00' },
    weekend: { on: false, time: '09:00' },
    station: '',            // vacío: la primera de la lista
    sunrise: 10             // minutos de amanecer antes de sonar
  };
  var SUNRISE_OPTIONS = [0, 5, 10, 15, 20, 30];

  var config = null;

  function validTime(t) { return typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t); }

  function sanitizeSlot(raw, fallback) {
    raw = raw || {};
    return { on: typeof raw.on === 'boolean' ? raw.on : fallback.on, time: validTime(raw.time) ? raw.time : fallback.time };
  }

  function sanitize(raw) {
    raw = raw || {};
    var ids = Frame.radioStations.map(function (s) { return s.id; });
    return {
      weekday: sanitizeSlot(raw.weekday, DEFAULTS.weekday),
      weekend: sanitizeSlot(raw.weekend, DEFAULTS.weekend),
      station: ids.indexOf(raw.station) >= 0 ? raw.station : ids[0],
      sunrise: SUNRISE_OPTIONS.indexOf(raw.sunrise) >= 0 ? raw.sunrise : DEFAULTS.sunrise
    };
  }

  function load() {
    config = sanitize(Frame.storage.read(STORAGE_KEY));
    return config;
  }

  function save(next) {
    config = sanitize(next);
    Frame.storage.write(STORAGE_KEY, config);
    return config;
  }

  function slotFor(date) {
    var day = date.getDay(); // 0 domingo … 6 sábado
    return day === 0 || day === 6 ? config.weekend : config.weekday;
  }

  // Próxima alarma después de `from` (Date), o null si ambas están apagadas.
  function next(from) {
    from = from || new Date();
    for (var d = 0; d < 8; d++) {
      var day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + d);
      var slot = slotFor(day);
      if (!slot.on) continue;
      var parts = slot.time.split(':');
      var at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(parts[0]), Number(parts[1]));
      if (at > from) return at;
    }
    return null;
  }

  var DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function formatTime(date) { return date.getHours() + ':' + pad(date.getMinutes()); }

  // «hoy 7:00», «mañana 7:00» o «sábado 9:00».
  function describe(date, now) {
    now = now || new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var days = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - today) / 86400000);
    var when = days === 0 ? 'hoy' : days === 1 ? 'mañana' : DAYS[date.getDay()];
    return when + ' ' + formatTime(date);
  }

  Frame.alarm = {
    SUNRISE_OPTIONS: SUNRISE_OPTIONS,
    load: load,
    save: save,
    get: function () { return config; },
    next: next,
    describe: describe,
    formatTime: formatTime
  };
})(window);
