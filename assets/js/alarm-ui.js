/*
 * Panel «Despertador»: horarios, radio, amanecer y los botones «Dormir» y
 * «Probar en 1 minuto». El botón ⏰ de los controles muestra la próxima
 * alarma.
 */
(function (global) {
  'use strict';

  var Frame = global.Frame = global.Frame || {};

  var TEST_DELAY_MS = 60 * 1000;

  function $(id) { return document.getElementById(id); }

  function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fill() {
    var c = Frame.alarm.get();
    $('alarm-weekday-on').checked = c.weekday.on;
    $('alarm-weekday-time').value = c.weekday.time;
    $('alarm-weekend-on').checked = c.weekend.on;
    $('alarm-weekend-time').value = c.weekend.time;
    $('alarm-station').value = c.station;
    $('alarm-sunrise').value = String(c.sunrise);
    summary();
  }

  function read() {
    return {
      weekday: { on: $('alarm-weekday-on').checked, time: $('alarm-weekday-time').value },
      weekend: { on: $('alarm-weekend-on').checked, time: $('alarm-weekend-time').value },
      station: $('alarm-station').value,
      sunrise: Number($('alarm-sunrise').value)
    };
  }

  function summary() {
    var at = Frame.alarm.next();
    $('alarm-next').textContent = at ? 'Próxima alarma: ' + Frame.alarm.describe(at) : 'Las dos alarmas están apagadas.';
    $('btn-sleep').disabled = !at;
  }

  // Botón de los controles: «⏰ 7:00» con la alarma activa o la próxima.
  function updateButton() {
    var armed = Frame.night.alarmAt();
    var at = armed ? new Date(armed) : Frame.alarm.next();
    var btn = $('btn-alarm');
    btn.textContent = '⏰ ' + (at ? Frame.alarm.formatTime(at) : 'Despertador');
    btn.className = 'ctl ctl-wide' + (armed ? ' ctl-toggle on' : '');
  }

  function open() {
    fill();
    $('alarm-sheet').className = 'settings';
  }

  function close() {
    $('alarm-sheet').className = 'settings hidden';
    updateButton();
  }

  function init(hideControls) {
    var html = '';
    var list = Frame.radioStations;
    for (var i = 0; i < list.length; i++) {
      html += '<option value="' + list[i].id + '">' + escapeHtml(list[i].name + ' ' + list[i].freq) + '</option>';
    }
    $('alarm-station').innerHTML = html;
    html = '';
    for (var j = 0; j < Frame.alarm.SUNRISE_OPTIONS.length; j++) {
      var m = Frame.alarm.SUNRISE_OPTIONS[j];
      html += '<option value="' + m + '">' + (m ? m + ' minutos antes' : 'Sin amanecer') + '</option>';
    }
    $('alarm-sunrise').innerHTML = html;

    $('alarm-form').addEventListener('change', function () {
      Frame.alarm.save(read());
      summary();
      updateButton();
    });
    $('btn-alarm').addEventListener('click', function () {
      hideControls();
      open();
    });
    $('btn-alarm-close').addEventListener('click', close);
    $('alarm-sheet').addEventListener('click', function (event) {
      if (event.target === $('alarm-sheet')) close();
    });
    // «Dormir» y «Probar» tienen que ir dentro del toque: habilitan el sonido.
    $('btn-sleep').addEventListener('click', function () {
      var c = Frame.alarm.save(read());
      var at = Frame.alarm.next();
      if (!at) return;
      close();
      Frame.night.sleep(at, c.sunrise, c.station);
    });
    $('btn-alarm-test').addEventListener('click', function () {
      var c = Frame.alarm.save(read());
      close();
      Frame.night.sleep(new Date(Date.now() + TEST_DELAY_MS), 0.5, c.station);
    });
    updateButton();
  }

  Frame.alarmUI = { init: init, updateButton: updateButton };
})(window);
