/*
 * Qué está sonando en la radio: canción, artista, álbum y carátula.
 *
 * Las estaciones de Triton (StreamTheWorld) publican lo que suena en
 * np.tritondigital.com/public/nowplaying (XML, permite CORS), con el nombre
 * de la señal sin «_SC». Se consulta cada 20 s mientras la radio suena; no
 * hace falta una segunda conexión de audio.
 *
 * Las demás (DPS y Mediastream) solo llevan el título dentro del audio (ICY)
 * y no dejan pedirlo desde una página web; además las de noticias lo mandan
 * vacío. Para ellas no se muestra nada.
 *
 * Si lo último fue una tanda comercial, o la canción empezó hace más de 12
 * minutos (probablemente ya es un programa hablado), no se muestra canción.
 */
(function (global) {
  'use strict';

  var Frame = global.Frame = global.Frame || {};

  var NP_URL = 'https://np.tritondigital.com/public/nowplaying?numberToFetch=1&mountName=';
  var POLL_MS = 20000;
  var STALE_MS = 12 * 60 * 1000;
  var MOUNT = /streamtheworld\.com\/api\/livestream-redirect\/([A-Z0-9_]+?)(?:_SC)?$/;

  var station = null;      // estación consultada
  var timer = null;
  var gen = 0;
  var info = null;         // { title, artist, album, cover, kind: 'track' | 'ad' }
  var listeners = [];

  function mountOf(st) {
    var m = st && st.urls && MOUNT.exec(st.urls[0]);
    return m ? m[1] : null;
  }

  function notify() {
    for (var i = 0; i < listeners.length; i++) listeners[i](info, station);
  }

  function set(next) {
    var same = (info && info.title) === (next && next.title) && (info && info.kind) === (next && next.kind);
    info = next;
    if (!same) notify();
  }

  function parse(xml) {
    var doc = new DOMParser().parseFromString(xml, 'text/xml');
    var item = doc.getElementsByTagName('nowplaying-info')[0];
    if (!item) return null;
    var props = {};
    var list = item.getElementsByTagName('property');
    for (var i = 0; i < list.length; i++) props[list[i].getAttribute('name')] = list[i].textContent;
    if (item.getAttribute('type') !== 'track') return { kind: 'ad' };
    var start = Number(props.cue_time_start) || 0;
    if (start && Date.now() - start > STALE_MS) return null;
    if (!props.cue_title) return null;
    return {
      kind: 'track',
      title: props.cue_title,
      // Triton separa los artistas con coma sin espacio.
      artist: (props.track_artist_name || '').replace(/,(?=\S)/g, ', '),
      album: props.track_album_name || '',
      cover: /^https:\/\//i.test(props.track_cover_url || '') ? props.track_cover_url : ''
    };
  }

  function poll(my) {
    var mount = mountOf(station);
    if (!mount) return;
    global.fetch(NP_URL + encodeURIComponent(mount)).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.text();
    }).then(function (xml) {
      if (my === gen) set(parse(xml));
    }).catch(function (err) {
      if (my === gen) Frame.compat.log('Radio: no se pudo saber qué suena (' + err.message + ')', true);
    }).then(function () {
      if (my !== gen) return;
      clearTimeout(timer);
      timer = setTimeout(function () { poll(my); }, POLL_MS);
    });
  }

  // Estación que suena ahora (o null si la radio está apagada o falló).
  function watch(st) {
    if (st === station) return;
    gen++;
    clearTimeout(timer);
    station = st;
    set(null);
    if (mountOf(st)) poll(gen);
  }

  Frame.nowPlaying = {
    watch: watch,
    get: function () { return info; },
    hasInfo: function (st) { return !!mountOf(st); },
    onChange: function (fn) { listeners.push(fn); }
  };
})(window);
