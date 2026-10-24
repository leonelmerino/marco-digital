#!/usr/bin/env node
/*
 * Genera assets/js/data/cities.js con las ciudades de GeoNames (CC BY 4.0)
 * y las fronteras de Natural Earth (dominio público).
 *
 * Uso:
 *   node tools/build-cities.js <carpeta-geonames> <ne_50m_admin_0_countries.geojson>
 *
 * La carpeta debe tener, descargados de https://download.geonames.org/export/dump/:
 *   cities15000.txt      (de cities15000.zip)
 *   alternateNamesV2.txt (de alternateNamesV2.zip; para los nombres en español)
 * Las fronteras: geojson/ne_50m_admin_0_countries.geojson del repositorio
 * nvkelso/natural-earth-vector (v5.1.2).
 *
 * Los nombres de países salen de Intl.DisplayNames de Node (datos CLDR).
 * Se descartan los barrios (PPLX); las coordenadas se redondean a 0,01°
 * (~1 km) y la población a miles. Las fronteras se simplifican a ~2 km.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var readline = require('readline');

var dir = process.argv[2];
var bordersFile = process.argv[3];
if (!dir || !bordersFile) {
  console.error('Uso: node tools/build-cities.js <carpeta-geonames> <ne_50m_admin_0_countries.geojson>');
  process.exit(1);
}
var OUT = path.join(__dirname, '..', 'assets', 'js', 'data', 'cities.js');

var cities = [];
var byId = {};
fs.readFileSync(path.join(dir, 'cities15000.txt'), 'utf8').split('\n').forEach(function (line) {
  var f = line.split('\t');
  if (f.length < 15 || f[7] === 'PPLX') return;
  var city = {
    id: f[0],
    name: f[1],
    lat: Number(f[4]),
    lon: Number(f[5]),
    cc: f[8],
    pop: Number(f[14]) || 0,
    es: null
  };
  cities.push(city);
  byId[city.id] = city;
});

// Nombre en español: el preferido si lo hay; si no, el primero que no sea
// coloquial ni histórico.
var rank = {};
var input = fs.createReadStream(path.join(dir, 'alternateNamesV2.txt'), 'utf8');
readline.createInterface({ input: input, crlfDelay: Infinity }).on('line', function (line) {
  var f = line.split('\t');
  if (f[2] !== 'es') return;
  var city = byId[f[1]];
  if (!city || f[6] === '1' || f[7] === '1') return;
  var r = f[4] === '1' ? 2 : 1;
  if ((rank[city.id] || 0) >= r) return;
  rank[city.id] = r;
  city.es = f[3];
}).on('close', write);

function clean(text) { return text.replace(/[\t\n|]/g, ' '); }

// Nombres que en la leyenda («ciudad, país») quedarían redundantes.
var OVERRIDES = { '3871336': 'Santiago' }; // «Santiago de Chile, Chile»

// ---- Fronteras ----

var SIMPLIFY_DEG = 0.02;
var FIX_CODES = { 'Somaliland': 'SO', 'N. Cyprus': 'CY' };

// Douglas-Peucker sobre un anillo cerrado.
function simplify(points, tolerance) {
  if (points.length <= 4) return points;
  var keep = new Array(points.length);
  keep[0] = keep[points.length - 1] = true;
  var stack = [[0, points.length - 1]];
  while (stack.length) {
    var seg = stack.pop();
    var a = points[seg[0]], b = points[seg[1]];
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var len = Math.sqrt(dx * dx + dy * dy);
    var far = -1, farDist = 0;
    for (var i = seg[0] + 1; i < seg[1]; i++) {
      var p = points[i];
      var d = len ? Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len
        : Math.sqrt(Math.pow(p[0] - a[0], 2) + Math.pow(p[1] - a[1], 2));
      if (d > farDist) { farDist = d; far = i; }
    }
    if (far >= 0 && farDist > tolerance) {
      keep[far] = true;
      stack.push([seg[0], far], [far, seg[1]]);
    }
  }
  return points.filter(function (p, i) { return keep[i]; });
}

// Cada país: [código, 'lon,lat,lon,lat…;anillo…'] en centésimas de grado.
function readBorders() {
  var geo = JSON.parse(fs.readFileSync(bordersFile, 'utf8'));
  var out = [];
  var points = 0;
  geo.features.forEach(function (f) {
    var cc = f.properties.ISO_A2_EH;
    if (!/^[A-Z]{2}$/.test(cc)) cc = FIX_CODES[f.properties.NAME];
    if (!cc) return;
    var polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    var rings = [];
    polys.forEach(function (poly) {
      poly.forEach(function (ring) {
        var simple = simplify(ring, SIMPLIFY_DEG);
        var flat = [];
        var last = '';
        simple.forEach(function (p) {
          var x = Math.round(p[0] * 100), y = Math.round(p[1] * 100);
          if (x + ',' + y === last) return;
          last = x + ',' + y;
          flat.push(x, y);
        });
        if (flat.length >= 6) { rings.push(flat.join(',')); points += flat.length / 2; }
      });
    });
    if (rings.length) out.push([cc, rings.join(';')]);
  });
  console.log('fronteras: ' + out.length + ' países, ' + points + ' puntos');
  return out;
}

function write() {
  var regions = new Intl.DisplayNames(['es'], { type: 'region' });
  var countries = {};
  var rows = [];
  var renamed = 0;
  var borders = readBorders();
  function addCountry(cc) {
    if (countries[cc]) return;
    var name = cc;
    try { name = regions.of(cc); } catch (e) { /* código sin nombre */ }
    countries[cc] = name;
  }
  borders.forEach(function (b) { addCountry(b[0]); });
  cities.sort(function (a, b) { return b.pop - a.pop; });
  cities.forEach(function (c) {
    addCountry(c.cc);
    if (c.es && c.es !== c.name) renamed++;
    rows.push([
      clean(OVERRIDES[c.id] || c.es || c.name),
      c.cc,
      Math.round(c.lat * 100),
      Math.round(c.lon * 100),
      Math.round(c.pop / 1000)
    ].join('|'));
  });
  var out = '/*\n' +
    ' * Ciudades de más de 15 000 habitantes, de GeoNames (https://www.geonames.org/),\n' +
    ' * licencia CC BY 4.0, y fronteras de Natural Earth (dominio público).\n' +
    ' * Generado por tools/build-cities.js; no editar a mano.\n' +
    ' * cities: nombre|país|latitud×100|longitud×100|habitantes en miles.\n' +
    ' * borders: [país, anillos separados por «;», cada uno lon,lat,… ×100].\n' +
    ' */\n' +
    'window.Frame = window.Frame || {};\n' +
    'window.Frame.cityData = {\n' +
    '  countries: ' + JSON.stringify(countries) + ',\n' +
    '  cities: ' + JSON.stringify(rows.join('\n')) + ',\n' +
    '  borders: ' + JSON.stringify(borders) + '\n' +
    '};\n';
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, out);
  console.log(rows.length + ' ciudades (' + renamed + ' con nombre en español), ' +
    Object.keys(countries).length + ' países, ' + Math.round(out.length / 1024) + ' KB');
}
