/* LeetThemes — local media storage.
 * Uploaded backgrounds are stored as data URLs in chrome.storage.local so they are readable
 * from content scripts on leetcode.com as well as from the options page and preview iframe.
 */
(function () {
  'use strict';

  const INDEX_KEY = 'lctMediaIndex';
  const ITEM_PREFIX = 'lctMedia:';
  const hasChromeStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  function itemKey(id) {
    return ITEM_PREFIX + id;
  }

  function storageGet(keys) {
    if (hasChromeStorage) {
      return new Promise(function (resolve) {
        chrome.storage.local.get(keys, function (result) {
          if (chrome.runtime.lastError) resolve({});
          else resolve(result || {});
        });
      });
    }
    const result = {};
    (Array.isArray(keys) ? keys : [keys]).forEach(function (key) {
      const raw = localStorage.getItem('lct:media:' + key);
      if (raw) {
        try { result[key] = JSON.parse(raw); } catch (error) { /* ignore */ }
      }
    });
    return Promise.resolve(result);
  }

  function storageSet(values) {
    if (hasChromeStorage) {
      return new Promise(function (resolve, reject) {
        chrome.storage.local.set(values, function () {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      });
    }
    Object.keys(values).forEach(function (key) {
      localStorage.setItem('lct:media:' + key, JSON.stringify(values[key]));
    });
    return Promise.resolve();
  }

  function storageRemove(keys) {
    if (hasChromeStorage) {
      return new Promise(function (resolve) {
        chrome.storage.local.remove(keys, function () { resolve(); });
      });
    }
    (Array.isArray(keys) ? keys : [keys]).forEach(function (key) {
      localStorage.removeItem('lct:media:' + key);
    });
    return Promise.resolve();
  }

  function readAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(reader.error || new Error('Could not read file')); };
      reader.readAsDataURL(file);
    });
  }

  async function getIndex() {
    const result = await storageGet(INDEX_KEY);
    const list = result[INDEX_KEY];
    return Array.isArray(list) ? list : [];
  }

  async function setIndex(list) {
    await storageSet({ [INDEX_KEY]: list });
  }

  function toMeta(record) {
    return {
      id: record.id,
      name: record.name,
      type: record.type,
      size: record.size,
      createdAt: record.createdAt
    };
  }

  const MAX_IMAGE_EDGE = 2560;

  // Every LeetCode tab reads the stored media on load, so shrink still images before storing them.
  // GIF/SVG are kept as-is (animation / vector), and the original wins if re-encoding isn't smaller.
  async function compressImage(file) {
    if (!/^image\/(png|jpeg|webp|bmp|avif)$/i.test(file.type || '') || typeof createImageBitmap !== 'function') return file;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      if (bitmap.close) bitmap.close();
      const blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/webp', 0.86); });
      return blob && blob.size < file.size ? blob : file;
    } catch (error) {
      return file;
    }
  }

  async function saveMedia(file) {
    if (!file) throw new Error('No file selected');
    const stored = await compressImage(file);
    const dataUrl = await readAsDataURL(stored);
    const id = 'media-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    const record = {
      id: id,
      name: file.name || 'background',
      type: stored.type || file.type || 'application/octet-stream',
      size: stored.size || 0,
      createdAt: Date.now(),
      dataUrl: dataUrl
    };
    await storageSet({ [itemKey(id)]: record });
    await updateIndex(function (index) { return index.concat(toMeta(record)); });
    return record;
  }

  // Uploads and cleanup can overlap; serialize index read-modify-writes so entries aren't lost.
  let indexQueue = Promise.resolve();
  function updateIndex(change) {
    const run = indexQueue.then(async function () {
      await setIndex(change(await getIndex()));
    });
    indexQueue = run.catch(function () {});
    return run;
  }

  async function getMedia(id) {
    if (!id) return null;
    const result = await storageGet(itemKey(id));
    return result[itemKey(id)] || null;
  }

  async function deleteMedia(id) {
    if (!id) return;
    await storageRemove(itemKey(id));
    await updateIndex(function (index) { return index.filter(function (item) { return item.id !== id; }); });
  }

  async function listMedia() {
    return getIndex();
  }

  async function createURL(id) {
    const record = await getMedia(id);
    if (!record || !record.dataUrl) return null;
    return { url: record.dataUrl, record: record };
  }

  globalThis.LCT = globalThis.LCT || {};
  globalThis.LCT.media = {
    save: saveMedia,
    get: getMedia,
    delete: deleteMedia,
    list: listMedia,
    createURL: createURL
  };
})();
