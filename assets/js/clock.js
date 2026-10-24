/*
 * Reloj local.
 * No se confía en que los temporizadores midan el tiempo real: cada tic lee
 * `new Date()` y programa el siguiente justo después del próximo cambio de
 * segundo. Al volver a primer plano se repinta de inmediato.
 */
(function (global) {
  'use strict';

  var Frame = global.Frame = global.Frame || {};

  var DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  var timeEl, dateEl, rootEl;
  var options = { format: '24', showDate: false };
  var timer = null;
  var lastTime = '';
  var lastDate = '';

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function formatTime(d) {
    var h = d.getHours();
    var m = pad(d.getMinutes());
    if (options.format === '12') {
      var suffix = h < 12 ? 'a. m.' : 'p. m.';
      h = h % 12 || 12;
      return h + ':' + m + '<span class="clock-ampm">' + suffix + '</span>';
    }
    return pad(h) + ':' + m;
  }

  function formatDate(d) {
    var day = DAYS[d.getDay()];
    return day.charAt(0).toUpperCase() + day.slice(1) + ', ' + d.getDate() + ' de ' + MONTHS[d.getMonth()];
  }

  function tick() {
    var now = new Date();
    var time = formatTime(now);
    if (time !== lastTime) {
      timeEl.innerHTML = time;
      lastTime = time;
    }
    if (options.showDate) {
      var date = formatDate(now);
      if (date !== lastDate) {
        dateEl.textContent = date;
        lastDate = date;
      }
    }
    schedule();
  }

  function schedule() {
    clearTimeout(timer);
    var now = new Date();
    // Despertar poco después del cambio de segundo; nunca acumular intervalos.
    timer = setTimeout(tick, 1000 - now.getMilliseconds() + 20);
  }

  function refresh() {
    lastTime = '';
    lastDate = '';
    tick();
  }

  function configure(settings) {
    options.format = settings.clockFormat;
    options.showDate = settings.dateVisible;
    rootEl.className = 'clock pos-' + settings.clockPosition + ' size-' + settings.clockSize +
      (settings.clockVisible ? '' : ' hidden');
    dateEl.className = settings.dateVisible ? 'clock-date' : 'clock-date hidden';
    refresh();
  }

  function init(settings) {
    rootEl = document.getElementById('clock');
    timeEl = document.getElementById('clock-time');
    dateEl = document.getElementById('clock-date');
    configure(settings);
  }

  Frame.clock = { init: init, configure: configure, refresh: refresh };
})(window);
