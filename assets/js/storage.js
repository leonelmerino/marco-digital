/*
 * Almacenamiento de preferencias.
 * localStorage puede fallar (navegación privada, cuota, datos borrados por iOS),
 * así que toda lectura y escritura va en try/catch y hay respaldo en memoria.
 * Se guardan preferencias y, con Dropbox conectado, su token de renovación
 * (ver docs/security.md). Nunca contraseñas ni fotos.
 */
(function (global) {
  'use strict';

  var Frame = global.Frame = global.Frame || {};
  var PREFIX = 'marco-digital:';
  var memory = {};

  function read(key) {
    var raw = null;
    try {
      raw = global.localStorage.getItem(PREFIX + key);
    } catch (e) {
      raw = Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
    }
    if (raw === null) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      Frame.compat.log('Preferencias dañadas; se usarán los valores por defecto', true);
      return null;
    }
  }

  function write(key, value) {
    var raw = JSON.stringify(value);
    memory[key] = raw;
    try {
      global.localStorage.setItem(PREFIX + key, raw);
      return true;
    } catch (e) {
      Frame.compat.log('No se pudo guardar en localStorage: ' + e.name, true);
      return false;
    }
  }

  function remove(key) {
    delete memory[key];
    try { global.localStorage.removeItem(PREFIX + key); } catch (e) { /* sin almacenamiento */ }
  }

  Frame.storage = { read: read, write: write, remove: remove };
})(window);
