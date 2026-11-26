/**
 * Persistencia local de metadatos, sin binarios y sin depender del DOM.
 *
 * Se expone como `SlideDownloaderLocalState` en el navegador y como módulo
 * CommonJS en Node para poder probarlo con un `localStorage` inyectado.
 */
(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else if (root) {
    root.SlideDownloaderLocalState = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RECENT_KEY = 'slidedownloader.recent.v1';
  const PREFERENCES_KEY = 'slidedownloader.preferences.v1';
  const MAX_RECENT = 10;
  const FORMATS = new Set(['pdf', 'pptx', 'ppsx', 'potx', 'docx', 'txt', 'md']);
  const QUALITIES = new Set(['sd', 'hd']);

  function resolveStorage(storage) {
    if (storage) return storage;

    try {
      return globalThis.localStorage || null;
    } catch (error) {
      // Algunos navegadores bloquean el acceso en modo privado.
      return null;
    }
  }

  function readJson(storage, key, fallback) {
    if (!storage || typeof storage.getItem !== 'function') return fallback;

    try {
      const raw = storage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(storage, key, value) {
    if (!storage || typeof storage.setItem !== 'function') return false;

    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      // Cuota agotada o almacenamiento deshabilitado: la UI sigue funcionando.
      return false;
    }
  }

  function cleanText(value, maxLength) {
    if (typeof value !== 'string') return '';
    return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
  }

  function safeUrl(value) {
    if (typeof value !== 'string') return '';

    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
    } catch (error) {
      return '';
    }
  }

  function normalizeEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;

    const url = safeUrl(entry.url);
    if (!url) return null;

    const format = String(entry.format || '').toLowerCase();
    const quality = String(entry.quality || '').toLowerCase();
    const slideCount = Number(entry.slideCount);
    const at = Number(entry.at);

    return {
      url,
      title: cleanText(entry.title, 160),
      format: FORMATS.has(format) ? format : 'pdf',
      quality: QUALITIES.has(quality) ? quality : 'sd',
      slideCount: Number.isFinite(slideCount) && slideCount >= 0 ? Math.round(slideCount) : null,
      fileName: cleanText(entry.fileName, 200),
      at: Number.isFinite(at) && at > 0 ? Math.round(at) : Date.now()
    };
  }

  function readRecent(options = {}) {
    const storage = resolveStorage(options.storage);
    const stored = readJson(storage, RECENT_KEY, []);

    if (!Array.isArray(stored)) return [];

    return stored
      .slice(0, MAX_RECENT)
      .map(normalizeEntry)
      .filter(Boolean);
  }

  function addRecent(entry, options = {}) {
    const storage = resolveStorage(options.storage);
    const normalized = normalizeEntry(entry);
    if (!normalized) return readRecent(options);

    const previous = readRecent(options).filter((item) => (
      item.url !== normalized.url || item.format !== normalized.format || item.quality !== normalized.quality
    ));
    const next = [normalized, ...previous].slice(0, MAX_RECENT);
    if (!writeJson(storage, RECENT_KEY, next)) return readRecent(options);
    return next;
  }

  function clearRecent(options = {}) {
    const storage = resolveStorage(options.storage);
    writeJson(storage, RECENT_KEY, []);
    return [];
  }

  function readPreference(name, fallback, options = {}) {
    const storage = resolveStorage(options.storage);
    const keyName = cleanText(name, 60);
    if (!keyName) return fallback;

    const preferences = readJson(storage, PREFERENCES_KEY, {});
    if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return fallback;

    return Object.prototype.hasOwnProperty.call(preferences, keyName) ? preferences[keyName] : fallback;
  }

  function writePreference(name, value, options = {}) {
    const storage = resolveStorage(options.storage);
    const keyName = cleanText(name, 60);
    if (!keyName) return false;

    const preferences = readJson(storage, PREFERENCES_KEY, {});
    const safePreferences = preferences && typeof preferences === 'object' && !Array.isArray(preferences)
      ? { ...preferences }
      : {};

    safePreferences[keyName] = value;
    return writeJson(storage, PREFERENCES_KEY, safePreferences);
  }

  return {
    RECENT_KEY,
    PREFERENCES_KEY,
    MAX_RECENT,
    readRecent,
    addRecent,
    clearRecent,
    readPreference,
    writePreference
  };
});
