/*
 * Ciudad y país a partir de coordenadas, sin conexión.
 *
 * Usa la tabla de assets/js/data/cities.js (GeoNames, ~1 MB), que se carga
 * después de arrancar para no retrasar la primera foto. Las coordenadas de
 * las fotos nunca salen del iPad.
 *
 * - País: el de la frontera (Natural Earth, simplificada a ~2 km) que
 *   contiene el punto. En la costa la frontera simplificada puede dejar el
 *   punto en el mar; entonces vale el país de la ciudad.
 * - Ciudad: para no partir una gran ciudad en sus comunas o municipios, cada
 *   ciudad «abarca» un radio que crece con su población (4 km para 15 000
 *   habitantes, ~27 km para 5 millones): gana la más poblada de las que
 *   abarcan el punto; si ninguna, la más cercana a menos de 40 km. Solo
 *   cuentan las ciudades del mismo país, para no cruzar una frontera.
 *   Más lejos de toda ciudad (un parque nacional, la cordillera), solo el país.
 */
(function (global) {
  'use strict';

  var Frame = global.Frame = global.Frame || {};

  var DATA_URL = 'assets/js/data/cities.js?v=1';
  var NEAREST_KM = 40;
  var MAX_REACH_KM = 35;
  var KM_PER_DEG = 111.2;

  var state = 'idle';      // idle | loading | ready | error
  var waiting = [];
  var names, countries, codes, lats, lons, reach;
  var grid = {};           // celdas de 1°×1° → índices de ciudades
  var borders = [];        // { cc, box: [minX, minY, maxX, maxY], rings: [Float32Array] }

  function cell(lat, lon) { return Math.floor(lat) * 400 + Math.floor(lon); }

  function parse(data) {
    var rows = data.cities.split('\n');
    var n = rows.length;
    names = new Array(n);
    codes = new Array(n);
    lats = new Float32Array(n);
    lons = new Float32Array(n);
    reach = new Float32Array(n);
    countries = data.countries;
    for (var i = 0; i < n; i++) {
      var f = rows[i].split('|');
      names[i] = f[0];
      codes[i] = f[1];
      lats[i] = f[2] / 100;
      lons[i] = f[3] / 100;
      var pop = Math.max(15, Number(f[4]));
      reach[i] = Math.min(MAX_REACH_KM, 4 * Math.pow(pop / 15, 1 / 3));
      var key = cell(lats[i], lons[i]);
      (grid[key] || (grid[key] = [])).push(i);
    }
    for (var b = 0; b < data.borders.length; b++) borders.push(parseBorder(data.borders[b]));
    delete Frame.cityData; // la cadena original ya no hace falta
  }

  function parseBorder(entry) {
    var box = [Infinity, Infinity, -Infinity, -Infinity];
    var rings = entry[1].split(';').map(function (text) {
      var nums = text.split(',');
      var ring = new Float32Array(nums.length);
      for (var i = 0; i < nums.length; i += 2) {
        var x = ring[i] = nums[i] / 100;
        var y = ring[i + 1] = nums[i + 1] / 100;
        if (x < box[0]) box[0] = x;
        if (y < box[1]) box[1] = y;
        if (x > box[2]) box[2] = x;
        if (y > box[3]) box[3] = y;
      }
      return ring;
    });
    return { cc: entry[0], box: box, rings: rings };
  }

  // Par-impar sobre todos los anillos: así los huecos (Lesoto dentro de
  // Sudáfrica) quedan fuera.
  function inside(border, x, y) {
    var odd = false;
    for (var r = 0; r < border.rings.length; r++) {
      var ring = border.rings[r];
      var n = ring.length;
      for (var i = 0, j = n - 2; i < n; j = i, i += 2) {
        var yi = ring[i + 1], yj = ring[j + 1];
        if ((yi > y) !== (yj > y) &&
            x < (ring[j] - ring[i]) * (y - yi) / (yj - yi) + ring[i]) odd = !odd;
      }
    }
    return odd;
  }

  function countryAt(lat, lon) {
    for (var i = 0; i < borders.length; i++) {
      var b = borders[i];
      if (lon < b.box[0] || lon > b.box[2] || lat < b.box[1] || lat > b.box[3]) continue;
      if (inside(b, lon, lat)) return b.cc;
    }
    return null;
  }

  function load() {
    if (state !== 'idle') return;
    state = 'loading';
    var script = document.createElement('script');
    script.src = DATA_URL;
    script.onload = function () {
      try {
        parse(Frame.cityData);
        state = 'ready';
        Frame.compat.log('Tabla de ciudades lista: ' + names.length);
      } catch (e) {
        state = 'error';
        Frame.compat.log('Tabla de ciudades dañada: ' + e.message, true);
      }
      flush();
    };
    script.onerror = function () {
      state = 'error';
      Frame.compat.log('No se pudo cargar la tabla de ciudades', true);
      flush();
    };
    document.body.appendChild(script);
  }

  function flush() {
    var list = waiting;
    waiting = [];
    for (var i = 0; i < list.length; i++) list[i](state === 'ready');
  }

  function countryName(cc) { return countries[cc] || cc; }

  // Devuelve { city, country } (city puede ser ''), o null si no hay datos o
  // el punto está en el mar, lejos de toda ciudad.
  function place(lat, lon) {
    if (state !== 'ready' || typeof lat !== 'number' || typeof lon !== 'number') return null;
    var cc = countryAt(lat, lon);
    var kx = KM_PER_DEG * Math.cos(lat * Math.PI / 180);
    var span = Math.abs(lat) > 60 ? 2 : 1;
    var best = -1, nearest = -1, nearestKm = Infinity;
    var baseLat = Math.floor(lat), baseLon = Math.floor(lon);
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -span; dx <= span; dx++) {
        var list = grid[(baseLat + dy) * 400 + baseLon + dx];
        if (!list) continue;
        for (var j = 0; j < list.length; j++) {
          var i = list[j];
          if (cc && codes[i] !== cc) continue;
          var x = (lons[i] - lon) * kx;
          var y = (lats[i] - lat) * KM_PER_DEG;
          var km = Math.sqrt(x * x + y * y);
          if (km < nearestKm) { nearestKm = km; nearest = i; }
          // Las filas van de más a menos poblada: el índice menor gana.
          if (km <= reach[i] && (best < 0 || i < best)) best = i;
        }
      }
    }
    if (best < 0 && nearestKm <= NEAREST_KM) best = nearest;
    if (best >= 0) return { city: names[best], country: countryName(codes[best]) };
    return cc ? { city: '', country: countryName(cc) } : null;
  }

  Frame.geo = {
    // fn(ok) cuando la tabla está lista (o falló).
    ready: function (fn) {
      if (state === 'ready' || state === 'error') { fn(state === 'ready'); return; }
      waiting.push(fn);
      load();
    },
    isReady: function () { return state === 'ready'; },
    place: place
  };
})(window);
