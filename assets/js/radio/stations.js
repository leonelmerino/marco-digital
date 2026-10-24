/*
 * Estaciones predefinidas.
 *
 * Cada URL es la transmisión pública que usa el reproductor oficial de la
 * emisora (Triton/StreamTheWorld, DPS o Mediastream), comprobada el 23-10-2026:
 * HTTPS (la página se sirve por HTTPS y Safari bloquearía audio HTTP) y en
 * MP3 o AAC, que Safari de iOS 12 reproduce. Si una URL falla se prueba la
 * siguiente de la lista. La app solo enlaza la señal; no graba ni guarda audio.
 * No se incluyen logotipos: son marcas de cada emisora.
 */
(function (global) {
  'use strict';

  var Frame = global.Frame = global.Frame || {};

  function triton(mount) {
    return ['https://playerservices.streamtheworld.com/api/livestream-redirect/' + mount];
  }

  function dps(name, host) {
    return [
      'https://redirector.dps.live/' + name + '/mp3/icecast.audio',
      'https://' + host + '.dps.live/' + name + '/mp3/icecast.audio'
    ];
  }

  Frame.radioStations = [
    { id: 'corazon', name: 'Corazón', freq: '101.3', genre: 'Romántica y tropical', urls: triton('CORAZON_SC') },
    { id: 'imagina', name: 'Imagina', freq: '88.1', genre: 'Pop y baladas', urls: triton('IMAGINA_SC') },
    { id: 'activa', name: 'Activa', freq: '92.5', genre: 'Éxitos actuales', urls: triton('ACTIVA_SC') },
    { id: 'biobio', name: 'Bío-Bío', freq: '99.7', genre: 'Noticias', urls: dps('biobiosantiago', 'unlimited3-cl') },
    { id: 'pudahuel', name: 'Pudahuel', freq: '90.5', genre: 'Pop y latina', urls: triton('PUDAHUEL_SC') },
    { id: 'carolina', name: 'Carolina', freq: '99.3', genre: 'Urbano', urls: [
      'https://mdstrm.com/audio/637f68ddce4b1208597d8a86/icecast.audio',
      'https://mdstrm.com/audio/637f68ddce4b1208597d8a86/live.m3u8'
    ] },
    { id: 'cooperativa', name: 'Cooperativa', freq: '93.3', genre: 'Noticias', urls: dps('cooperativafm', 'unlimited3-cl') },
    { id: 'fmdos', name: 'FMDOS', freq: '98.5', genre: 'Baladas', urls: triton('FMDOS_SC') },
    { id: 'concierto', name: 'Concierto', freq: '88.5', genre: 'Pop y rock 80 y 90', urls: triton('CONCIERTO_SC') },
    { id: 'futuro', name: 'Futuro', freq: '88.9', genre: 'Rock clásico', urls: triton('FUTURO_SC') },
    { id: 'rockandpop', name: 'Rock & Pop', freq: '94.1', genre: 'Rock y alternativo', urls: triton('ROCK_AND_POP_SC') },
    { id: 'adn', name: 'ADN', freq: '91.7', genre: 'Noticias y deportes', urls: triton('ADN_SC') },
    { id: 'agricultura', name: 'Agricultura', freq: '92.1', genre: 'Noticias y deportes', urls: dps('agricultura', 'unlimited4-us') }
  ];
})(window);
