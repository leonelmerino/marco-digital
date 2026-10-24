/*
 * Panel «Filtrar fotos»: país (lista con número de fotos) y rango de años
 * (barras por año y un deslizador doble).
 *
 * El deslizador es propio, con eventos táctiles y de ratón: dos <input
 * type="range"> superpuestos no responden bien al tacto en Safari 12.
 * Lo elegido se aplica al tocar «Listo».
 */
(function (global) {
  'use strict';

  var Frame = global.Frame = global.Frame || {};

  var getList = null;      // function () → fotos de la biblioteca
  var onApply = null;      // function () tras cambiar el filtro
  var draft = null;        // estado que se está eligiendo
  var last = null;         // últimas cifras calculadas
  var range = { min: 0, max: 0, from: 0, to: 0 };
  var dragging = -1;       // 0: «desde», 1: «hasta»

  function $(id) { return document.getElementById(id); }

  function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  function isOpen() { return $('filter-sheet').className.indexOf('hidden') < 0; }

  // ---- Países ----

  function row(value, name, n) {
    var active = draft.country === value;
    return '<button type="button" class="pick' + (active ? ' active' : '') + '" data-country="' + value + '">' +
      '<span class="pick-name">' + escapeHtml(name) + '</span>' +
      '<span class="pick-count">' + fmt(n) + '</span></button>';
  }

  function renderCountries(s) {
    var html = row('', 'Todos los países', s.total);
    for (var i = 0; i < s.countries.length; i++) {
      html += row(s.countries[i].cc, Frame.geo.countryName(s.countries[i].cc), s.countries[i].n);
    }
    if (s.none) html += row('-', 'Sin ubicación', s.none);
    // Un país elegido antes que todavía no aparece en el índice.
    if (draft.country && draft.country !== '-' && html.indexOf('data-country="' + draft.country + '"') < 0) {
      html += row(draft.country, Frame.geo.countryName(draft.country), 0);
    }
    $('filter-countries').innerHTML = html;
  }

  // ---- Años ----

  function frac(year) { return range.max > range.min ? (year - range.min) / (range.max - range.min) : 0; }

  function renderYears(s) {
    var hasYears = s.minYear > 0;
    $('filter-years').className = hasYears ? 'years' : 'years hidden';
    $('filter-years-empty').className = hasYears ? 'note hidden' : 'note';
    if (!hasYears) return;
    range.min = Math.min(s.minYear, draft.from !== null ? draft.from : s.minYear);
    range.max = Math.max(s.maxYear, draft.to !== null ? draft.to : s.maxYear);
    range.from = draft.from !== null ? draft.from : range.min;
    range.to = draft.to !== null ? draft.to : range.max;

    var top = 0;
    var y;
    for (y = range.min; y <= range.max; y++) top = Math.max(top, s.years[y] || 0);
    var span = range.max - range.min;
    var width = span ? 80 / (span + 1) : 30;
    var html = '';
    for (y = range.min; y <= range.max; y++) {
      var n = s.years[y] || 0;
      var h = top ? Math.max(n ? 6 : 0, Math.round(n / top * 100)) : 0;
      var inside = y >= range.from && y <= range.to;
      html += '<div class="bar' + (inside ? ' on' : '') + '" style="left:calc(' + (frac(y) * 100) + '% - ' +
        (width / 2) + '%);width:' + width + '%;height:' + h + '%"></div>';
    }
    $('year-bars').innerHTML = html;
    $('year-min').textContent = range.min;
    $('year-max').textContent = range.max;
    $('year-slider').className = span ? 'range2' : 'range2 hidden';
    placeThumbs();
  }

  function placeThumbs() {
    var a = frac(range.from) * 100;
    var b = frac(range.to) * 100;
    $('year-thumb-0').style.left = a + '%';
    $('year-thumb-1').style.left = b + '%';
    $('year-fill').style.left = a + '%';
    $('year-fill').style.width = (b - a) + '%';
  }

  function valueAt(clientX) {
    var rect = $('year-inner').getBoundingClientRect();
    var f = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(range.min + f * (range.max - range.min));
  }

  function setFromDrag(v) {
    if (dragging === 0) range.from = Math.min(v, range.to);
    else range.to = Math.max(v, range.from);
    // En un extremo queda sin límite: «desde el primer año» sigue siéndolo
    // aunque el índice encuentre después fotos más antiguas.
    draft.from = range.from === range.min ? null : range.from;
    draft.to = range.to === range.max ? null : range.to;
    renderTotals(Frame.photoFilter.stats(getList(), draft));
    placeThumbs();
  }

  function startDrag(clientX) {
    if (range.max <= range.min) return;
    var v = valueAt(clientX);
    if (v < range.from) dragging = 0;
    else if (v > range.to) dragging = 1;
    else dragging = (v - range.from) <= (range.to - v) ? 0 : 1;
    setFromDrag(v);
  }

  function bindSlider() {
    var slider = $('year-slider');
    slider.addEventListener('touchstart', function (e) {
      e.preventDefault();
      startDrag(e.touches[0].clientX);
    }, { passive: false });
    slider.addEventListener('touchmove', function (e) {
      e.preventDefault();
      if (dragging >= 0) setFromDrag(valueAt(e.touches[0].clientX));
    }, { passive: false });
    slider.addEventListener('touchend', function () { dragging = -1; render(); });
    slider.addEventListener('mousedown', function (e) {
      e.preventDefault();
      startDrag(e.clientX);
    });
    document.addEventListener('mousemove', function (e) {
      if (dragging >= 0) setFromDrag(valueAt(e.clientX));
    });
    document.addEventListener('mouseup', function () {
      if (dragging < 0) return;
      dragging = -1;
      render();
    });
  }

  // ---- Totales y progreso ----

  function renderTotals(s) {
    var label = Frame.photoFilter.label(draft);
    $('filter-total').textContent = Frame.photoFilter.isActive(draft)
      ? label + ' · ' + fmt(s.matches) + (s.matches === 1 ? ' foto' : ' fotos')
      : 'Todas las fotos · ' + fmt(s.total);
    // Marcar en las barras el rango elegido mientras se arrastra.
    var bars = $('year-bars').children;
    for (var i = 0; i < bars.length; i++) {
      var y = range.min + i;
      bars[i].className = y >= range.from && y <= range.to ? 'bar on' : 'bar';
    }
  }

  function render() {
    if (!getList || dragging >= 0) return;
    var s = last = Frame.photoFilter.stats(getList(), draft);
    var pct = s.total ? Math.floor(s.indexed / s.total * 100) : 100;
    $('filter-progress').textContent = s.indexed < s.total
      ? 'Revisando fotos: ' + fmt(s.indexed) + ' de ' + fmt(s.total) + ' (' + pct + ' %). Las cifras crecen a medida que avanza.'
      : fmt(s.total) + ' fotos revisadas.';
    renderCountries(s);
    renderYears(s);
    renderTotals(s);
  }

  // ---- Abrir y cerrar ----

  function open() {
    draft = Frame.photoFilter.get();
    $('filter-sheet').className = 'settings';
    render();
  }

  function close() {
    $('filter-sheet').className = 'settings hidden';
    var before = Frame.photoFilter.label();
    Frame.photoFilter.set(draft);
    if (Frame.photoFilter.label() !== before && onApply) onApply();
  }

  function init(listFn, applyFn) {
    getList = listFn;
    onApply = applyFn;
    $('filter-countries').addEventListener('click', function (event) {
      var button = event.target.closest ? event.target.closest('.pick') : null;
      if (!button) return;
      draft.country = button.getAttribute('data-country');
      render();
    });
    $('btn-filter-close').addEventListener('click', close);
    $('btn-filter-clear').addEventListener('click', function () {
      draft = { country: '', from: null, to: null };
      render();
    });
    $('filter-sheet').addEventListener('click', function (event) {
      if (event.target === $('filter-sheet')) close();
    });
    bindSlider();
    // Mientras está abierto, las cifras siguen al índice.
    Frame.photoIndex.onChange(function () { if (isOpen()) render(); });
  }

  Frame.filterUI = { init: init, open: open, isOpen: isOpen };
})(window);
