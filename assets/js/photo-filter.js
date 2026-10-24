/*
 * Filtro de fotos por país y rango de años, según el índice (photo-index.js).
 *
 * Estado: { country: '' (todos) | 'CL' | '-' (sin ubicación),
 *           from: año o null, to: año o null }  (null = sin límite)
 * Se guarda en localStorage; un valor dañado vuelve a «todas».
 *
 * Con el filtro puesto solo cuentan las fotos ya revisadas por el índice: a
 * medida que avanza aparecen más. Con un rango de años, las fotos sin fecha
 * de la toma (escaneos, WhatsApp) quedan fuera.
 */
(function (global) {
  'use strict';

  var Frame = global.Frame = global.Frame || {};
  var STORAGE_KEY = 'filter.v1';

  var state = { country: '', from: null, to: null };

  function validYear(y) { return typeof y === 'number' && y >= 1900 && y <= 2100 ? Math.floor(y) : null; }

  function sanitize(raw) {
    raw = raw || {};
    var s = {
      country: typeof raw.country === 'string' && /^([A-Z]{2}|-)?$/.test(raw.country) ? raw.country : '',
      from: validYear(raw.from),
      to: validYear(raw.to)
    };
    if (s.from !== null && s.to !== null && s.from > s.to) { var t = s.from; s.from = s.to; s.to = t; }
    return s;
  }

  function isActive(s) {
    s = s || state;
    return !!(s.country || s.from !== null || s.to !== null);
  }

  function countryMatches(rec, s) {
    if (!s.country) return true;
    if (s.country === '-') return rec.cc === '';
    return rec.cc === s.country;
  }

  function yearMatches(rec, s) {
    if (s.from === null && s.to === null) return true;
    var y = Frame.photoIndex.yearOf(rec);
    return !!y && (s.from === null || y >= s.from) && (s.to === null || y <= s.to);
  }

  function matches(photo, s) {
    s = s || state;
    if (!isActive(s)) return true;
    var rec = Frame.photoIndex.get(photo.path);
    if (!rec || rec.cc === null) return false; // sin revisar todavía
    return countryMatches(rec, s) && yearMatches(rec, s);
  }

  function apply(list) {
    if (!isActive()) return list;
    var out = [];
    for (var i = 0; i < list.length; i++) if (matches(list[i])) out.push(list[i]);
    return out;
  }

  // Números para el panel, con el estado `s` (el que se está eligiendo).
  //   indexed: fotos revisadas; countries: [{ cc, n }] de más a menos;
  //   none: sin ubicación; years: { año: n } del país elegido;
  //   minYear/maxYear: de todas las fotos; matches: fotos que pasan el filtro.
  function stats(list, s) {
    var out = { total: list.length, indexed: 0, countries: [], none: 0, years: {}, minYear: 0, maxYear: 0, matches: 0 };
    var byCountry = {};
    for (var i = 0; i < list.length; i++) {
      var rec = Frame.photoIndex.get(list[i].path);
      if (!rec || rec.cc === null) continue;
      out.indexed++;
      if (rec.cc === '') out.none++;
      else byCountry[rec.cc] = (byCountry[rec.cc] || 0) + 1;
      var y = Frame.photoIndex.yearOf(rec);
      if (y) {
        if (!out.minYear || y < out.minYear) out.minYear = y;
        if (y > out.maxYear) out.maxYear = y;
        if (countryMatches(rec, s)) out.years[y] = (out.years[y] || 0) + 1;
      }
      if (countryMatches(rec, s) && yearMatches(rec, s)) out.matches++;
    }
    for (var cc in byCountry) out.countries.push({ cc: cc, n: byCountry[cc] });
    out.countries.sort(function (a, b) { return b.n - a.n; });
    if (!isActive(s)) out.matches = list.length;
    return out;
  }

  function yearsLabel(s) {
    if (s.from === null && s.to === null) return '';
    if (s.from !== null && s.from === s.to) return String(s.from);
    if (s.from === null) return 'hasta ' + s.to;
    if (s.to === null) return 'desde ' + s.from;
    return s.from + '–' + s.to;
  }

  function countryLabel(s) {
    if (!s.country) return '';
    if (s.country === '-') return 'Sin ubicación';
    return Frame.geo.countryName(s.country);
  }

  function label(s) {
    s = s || state;
    var parts = [];
    if (countryLabel(s)) parts.push(countryLabel(s));
    if (yearsLabel(s)) parts.push(yearsLabel(s));
    return parts.length ? parts.join(' · ') : 'Todas';
  }

  Frame.photoFilter = {
    load: function () { state = sanitize(Frame.storage.read(STORAGE_KEY)); return state; },
    get: function () { return { country: state.country, from: state.from, to: state.to }; },
    set: function (s) {
      state = sanitize(s);
      if (isActive()) Frame.storage.write(STORAGE_KEY, state);
      else Frame.storage.remove(STORAGE_KEY);
    },
    isActive: isActive,
    apply: apply,
    stats: stats,
    label: label
  };
})(window);
