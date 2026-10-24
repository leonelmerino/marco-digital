/*
 * Inicio de sesión en Dropbox con OAuth 2.0 + PKCE, sin secreto de aplicación.
 *
 * 1. connect(): genera un verificador aleatorio y su resumen SHA-256, guarda el
 *    verificador y un `state` y lleva al usuario a dropbox.com.
 * 2. Dropbox vuelve a esta página con ?code=…&state=…; handleRedirect() cambia
 *    el código por un token de acceso (4 h) y un token de renovación, y quita
 *    el código de la dirección.
 * 3. getAccessToken() renueva el token de acceso cuando hace falta.
 *
 * Seguridad:
 * - El token de acceso solo vive en memoria. El de renovación se guarda en
 *   localStorage porque no hay otro sitio que sobreviva a una recarga; da
 *   acceso de solo lectura y se anula con «Desconectar» o desde
 *   dropbox.com › Configuración › Aplicaciones conectadas.
 * - Los tokens nunca se escriben en el registro, en mensajes ni en URLs.
 */
(function (global) {
  'use strict';

  var Frame = global.Frame = global.Frame || {};

  var AUTHORIZE_URL = 'https://www.dropbox.com/oauth2/authorize';
  var TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
  var REVOKE_URL = 'https://api.dropboxapi.com/2/auth/token/revoke';
  var ACCOUNT_KEY = 'dropbox.v1';       // { refreshToken, folder }
  var PENDING_KEY = 'dropbox.pending';  // { verifier, state, at } durante el inicio de sesión
  var PENDING_MAX_MS = 30 * 60 * 1000;
  var EXPIRY_MARGIN_MS = 5 * 60 * 1000;

  var account = null;      // copia en memoria de ACCOUNT_KEY
  var accessToken = null;
  var expiresAt = 0;
  var refreshing = null;   // promesa compartida mientras se renueva

  function log(text, isError) { Frame.compat.log('Dropbox: ' + text, isError); }

  // Dirección de esta página tal como está registrada en Dropbox.
  function redirectUri() {
    return global.location.origin + global.location.pathname.replace(/index\.html$/, '');
  }

  // Dropbox solo acepta https o http://localhost como dirección de retorno.
  function canConnectHere() {
    return global.location.protocol === 'https:' || global.location.hostname === 'localhost';
  }

  // ---- PKCE ----

  function base64url(bytes) {
    var text = '';
    for (var i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
    return global.btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function randomString(byteCount) {
    var bytes = new Uint8Array(byteCount);
    global.crypto.getRandomValues(bytes);
    return base64url(bytes);
  }

  function sha256(text) {
    var bytes = new Uint8Array(text.length);
    for (var i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i); // texto ASCII
    return global.crypto.subtle.digest('SHA-256', bytes).then(function (hash) {
      return base64url(new Uint8Array(hash));
    });
  }

  // ---- Peticiones de token ----

  function form(params) {
    var parts = [];
    for (var key in params) parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
    return parts.join('&');
  }

  function tokenRequest(params) {
    return global.fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form(params)
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok || !data.access_token) {
          var err = new Error(data.error_description || data.error || ('HTTP ' + response.status));
          err.code = data.error || 'http_' + response.status;
          throw err;
        }
        accessToken = data.access_token;
        expiresAt = Date.now() + (data.expires_in || 14400) * 1000;
        return data;
      });
    });
  }

  function saveAccount() {
    if (account) Frame.storage.write(ACCOUNT_KEY, account);
    else Frame.storage.remove(ACCOUNT_KEY);
  }

  // ---- API pública ----

  function connect() {
    if (!canConnectHere()) return Promise.reject(new Error('Dirección no admitida por Dropbox'));
    if (!global.crypto || !global.crypto.subtle || !global.crypto.getRandomValues) {
      return Promise.reject(new Error('Este navegador no tiene crypto.subtle'));
    }
    var verifier = randomString(48); // 64 caracteres
    var state = randomString(16);
    return sha256(verifier).then(function (challenge) {
      Frame.storage.write(PENDING_KEY, { verifier: verifier, state: state, at: Date.now() });
      log('se abre dropbox.com para iniciar sesión');
      global.location.href = AUTHORIZE_URL + '?' + form({
        client_id: Frame.dropboxConfig.appKey,
        response_type: 'code',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        redirect_uri: redirectUri(),
        token_access_type: 'offline',
        state: state
      });
    });
  }

  // Devuelve una promesa: true si se acaba de conectar, false si no había
  // nada que procesar. Siempre limpia la dirección.
  function handleRedirect() {
    var query = global.location.search;
    if (!/[?&](code|error)=/.test(query)) return Promise.resolve(false);

    var params = {};
    query.replace(/^\?/, '').split('&').forEach(function (pair) {
      var i = pair.indexOf('=');
      if (i > 0) params[decodeURIComponent(pair.slice(0, i))] = decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '));
    });
    // Quitar el código de la barra de direcciones y del historial.
    global.history.replaceState(null, '', redirectUri());

    var pending = Frame.storage.read(PENDING_KEY);
    Frame.storage.remove(PENDING_KEY);

    if (params.error) {
      log('inicio de sesión cancelado (' + params.error + ')', true);
      return Promise.reject(new Error('Se canceló el inicio de sesión'));
    }
    if (!pending || pending.state !== params.state || Date.now() - pending.at > PENDING_MAX_MS) {
      log('respuesta de inicio de sesión no válida o caducada', true);
      return Promise.reject(new Error('El inicio de sesión caducó; vuelve a intentarlo'));
    }
    return tokenRequest({
      code: params.code,
      grant_type: 'authorization_code',
      code_verifier: pending.verifier,
      client_id: Frame.dropboxConfig.appKey,
      redirect_uri: redirectUri()
    }).then(function (data) {
      if (!data.refresh_token) throw new Error('Dropbox no entregó token de renovación');
      account = { refreshToken: data.refresh_token, folder: account ? account.folder : null };
      saveAccount();
      log('conectado');
      return true;
    }, function (err) {
      log('no se pudo completar el inicio de sesión (' + err.code + ')', true);
      throw err;
    });
  }

  function getAccessToken(forceRefresh) {
    if (!account) return Promise.reject(new Error('No conectado'));
    if (!forceRefresh && accessToken && Date.now() < expiresAt - EXPIRY_MARGIN_MS) {
      return Promise.resolve(accessToken);
    }
    if (!refreshing) {
      refreshing = tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: account.refreshToken,
        client_id: Frame.dropboxConfig.appKey
      }).then(function () {
        refreshing = null;
        return accessToken;
      }, function (err) {
        refreshing = null;
        if (err.code === 'invalid_grant') {
          // El permiso se anuló desde Dropbox: hay que volver a conectar.
          log('el permiso fue anulado; hay que volver a conectar', true);
          forget();
        }
        throw err;
      });
    }
    return refreshing;
  }

  function forget() {
    account = null;
    accessToken = null;
    expiresAt = 0;
    saveAccount();
  }

  function disconnect() {
    var token = accessToken;
    var revoke = token
      ? global.fetch(REVOKE_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + token } })
        .catch(function () { /* sin red: igual se borra aquí */ })
      : getAccessToken().then(function (fresh) {
        return global.fetch(REVOKE_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + fresh } });
      }).catch(function () { /* ya anulado o sin red */ });
    return revoke.then(function () {
      forget();
      log('desconectado');
    });
  }

  Frame.dropboxAuth = {
    init: function () {
      var stored = Frame.storage.read(ACCOUNT_KEY);
      account = stored && typeof stored.refreshToken === 'string' ? stored : null;
    },
    canConnectHere: canConnectHere,
    isConnected: function () { return !!account; },
    connect: connect,
    handleRedirect: handleRedirect,
    getAccessToken: getAccessToken,
    disconnect: disconnect,
    getFolder: function () { return account ? account.folder : null; },
    setFolder: function (folder) {
      if (!account) return;
      account.folder = folder;
      saveAccount();
    }
  };
})(window);
