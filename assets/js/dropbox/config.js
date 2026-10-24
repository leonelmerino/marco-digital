/*
 * Configuración pública de Dropbox.
 *
 * La App key identifica a la aplicación y no es secreta: con PKCE el navegador
 * no necesita el secreto de la aplicación, que nunca debe estar en este
 * repositorio. Las direcciones de retorno registradas en la consola de Dropbox
 * son exactamente:
 *   https://leonelmerino.github.io/marco-digital/
 *   http://localhost:8010/
 */
(function (global) {
  'use strict';

  var Frame = global.Frame = global.Frame || {};

  Frame.dropboxConfig = {
    appKey: '489qb4d7a32gt8x'
  };
})(window);
