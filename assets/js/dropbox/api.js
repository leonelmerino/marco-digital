/*
 * Cliente mínimo de la API HTTP de Dropbox (v2) con fetch.
 *
 * - rpc(): llamadas de api.dropboxapi.com con argumentos JSON.
 * - thumbnail(): versión reducida de una foto desde content.dropboxapi.com,
 *   como Blob. Nunca se descarga el archivo original.
 * - Si el token caducó (401) se renueva una vez y se repite la llamada; si
 *   Dropbox pide esperar (429), se espera lo que indica.
 */
(function (global) {
  'use strict';

  var Frame = global.Frame = global.Frame || {};

  var API = 'https://api.dropboxapi.com/2/';
  var CONTENT = 'https://content.dropboxapi.com/2/';
  var MAX_WAIT_S = 60;

  // La cabecera Dropbox-API-Arg solo admite ASCII: se escapan los demás
  // caracteres (tildes, ñ…) como \uXXXX, que sigue siendo JSON válido.
  function headerJson(value) {
    return JSON.stringify(value).replace(/[\u007f-￿]/g, function (c) {
      return '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4);
    });
  }

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function apiError(response) {
    return response.text().then(function (text) {
      var data = null;
      try { data = JSON.parse(text); } catch (e) { /* texto plano */ }
      var err = new Error(data && data.error_summary ? data.error_summary : 'HTTP ' + response.status);
      err.status = response.status;
      err.summary = data && data.error_summary ? data.error_summary : '';
      err.retryAfter = Number(response.headers.get('Retry-After')) || 0;
      throw err;
    });
  }

  // makeRequest(token) devuelve la promesa de fetch.
  function call(makeRequest, attempt) {
    attempt = attempt || 0;
    return Frame.dropboxAuth.getAccessToken(attempt > 0 && attempt < 2).then(function (token) {
      return makeRequest(token);
    }).then(function (response) {
      if (response.ok) return response;
      return apiError(response);
    }).catch(function (err) {
      if (err.status === 401 && attempt === 0) return call(makeRequest, 1);
      if ((err.status === 429 || err.status === 503) && attempt < 3) {
        var wait = Math.min(err.retryAfter || 5, MAX_WAIT_S);
        Frame.compat.log('Dropbox pide esperar ' + wait + ' s', true);
        return delay(wait * 1000).then(function () { return call(makeRequest, attempt + 2); });
      }
      throw err;
    });
  }

  function rpc(endpoint, args) {
    return call(function (token) {
      return global.fetch(API + endpoint, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(args === undefined ? null : args)
      });
    }).then(function (response) { return response.json(); });
  }

  // Formato JPEG y el tamaño mayor que ofrece Dropbox (2048×1536), justo la
  // pantalla del iPad Air. `bestfit` admite también 1536×2048 para las fotos
  // verticales, sin recortar. Con `small`, 1024×768: para las fotos que
  // ocupan media pantalla o un cuarto en una vista de varias fotos.
  function thumbnail(path, small) {
    var arg = headerJson({
      resource: { '.tag': 'path', path: path },
      format: 'jpeg',
      size: small ? 'w1024h768' : 'w2048h1536',
      mode: 'bestfit'
    });
    return call(function (token) {
      return global.fetch(CONTENT + 'files/get_thumbnail_v2', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Dropbox-API-Arg': arg }
      });
    }).then(function (response) { return response.blob(); });
  }

  Frame.dropboxApi = { rpc: rpc, thumbnail: thumbnail };
})(window);
