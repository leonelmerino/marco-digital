/*
 * Texto que acompaña a cada foto: fecha («12 de marzo de 2016 · hace 8 años»)
 * y lugar («Santiago, Chile»).
 *
 * photo.info lo rellena la biblioteca de Dropbox:
 *   { taken: 'AAAA-MM-DD' o null, lat, lon (o null) }
 * La fecha se toma tal cual del texto, sin convertir zonas horarias, para no
 * mover una foto de la noche al día siguiente.
 */
(function (global) {
  'use strict';

  var Frame = global.Frame = global.Frame || {};

  var MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function parseDate(text) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text || '');
    if (!m) return null;
    var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return { y: y, m: mo, d: d };
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function ago(date, now) {
    var months = (now.getFullYear() - date.y) * 12 + (now.getMonth() + 1 - date.m);
    if (now.getDate() < date.d) months--;
    if (months >= 12) return 'hace ' + plural(Math.floor(months / 12), 'año', 'años');
    if (months >= 1) return 'hace ' + plural(months, 'mes', 'meses');
    return '';
  }

  function dateLine(info, now) {
    var date = parseDate(info.taken);
    if (!date) return '';
    var text = date.d + ' de ' + MONTHS[date.m - 1] + ' de ' + date.y;
    var rel = ago(date, now || new Date());
    return rel ? text + ' · ' + rel : text;
  }

  function placeLine(info) {
    var p = Frame.geo.place(info.lat, info.lon);
    if (!p) return '';
    return p.city ? p.city + ', ' + p.country : p.country;
  }

  // Líneas para la leyenda; vacío si la foto no tiene datos.
  function caption(photo) {
    var info = photo.info;
    if (!info) return [];
    var lines = [];
    var date = dateLine(info);
    var place = placeLine(info);
    if (place) lines.push(place);
    if (date) lines.push(date);
    return lines;
  }

  Frame.photoInfo = { caption: caption, dateLine: dateLine, parseDate: parseDate };
})(window);
