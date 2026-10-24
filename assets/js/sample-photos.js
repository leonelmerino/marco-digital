/*
 * Fotos de prueba de la fase 1. Son imágenes generadas, sin datos personales.
 * En la fase 3 esta lista la sustituirá el adaptador de Dropbox.
 *
 * Con `?prueba=error` en la URL se añade una foto inexistente para comprobar
 * que la presentación no se bloquea cuando falla una descarga.
 */
(function (global) {
  'use strict';

  var Frame = global.Frame = global.Frame || {};

  var list = [
    { name: 'foto-01.jpg', url: 'assets/photos/foto-01.jpg' },
    { name: 'foto-02.jpg', url: 'assets/photos/foto-02.jpg' },
    { name: 'foto-03.jpg', url: 'assets/photos/foto-03.jpg' },
    { name: 'foto-04.jpg', url: 'assets/photos/foto-04.jpg' },
    { name: 'foto-05.png', url: 'assets/photos/foto-05.png' }
  ];

  if (/[?&]prueba=error\b/.test(global.location.search)) {
    list.push({ name: 'no-existe.jpg', url: 'assets/photos/no-existe.jpg' });
  }
  if (/[?&]prueba=vacio\b/.test(global.location.search)) {
    list = [];
  }

  Frame.samplePhotos = list;
})(window);
