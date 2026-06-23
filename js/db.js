/* ============================================================
   db.js — camada local-first sobre IndexedDB
   Todos os dados são gravados primeiro no dispositivo.
   (Sincronização com a nuvem é Fase 2/3 — ver README.)
   ============================================================ */
(function (global) {
  'use strict';

  const DB_NAME = 'eisen';
  const DB_VERSION = 1;
  const STORE = 'tasks';
  const META = 'meta';

  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: 'id' });
          os.createIndex('status', 'status', { unique: false });
          os.createIndex('quadrant', 'quadrant', { unique: false });
          os.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(META)) {
          db.createObjectStore(META, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(storeName, mode) {
    return open().then((db) => db.transaction(storeName, mode).objectStore(storeName));
  }

  function asPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  const DB = {
    /* ---------- Tasks ---------- */
    async all() {
      const store = await tx(STORE, 'readonly');
      return asPromise(store.getAll());
    },
    async get(id) {
      const store = await tx(STORE, 'readonly');
      return asPromise(store.get(id));
    },
    async put(task) {
      const store = await tx(STORE, 'readwrite');
      await asPromise(store.put(task));
      return task;
    },
    async remove(id) {
      const store = await tx(STORE, 'readwrite');
      return asPromise(store.delete(id));
    },
    async clearStatus(status) {
      const store = await tx(STORE, 'readwrite');
      const all = await asPromise(store.getAll());
      await Promise.all(all.filter(t => t.status === status).map(t => asPromise(store.delete(t.id))));
    },

    /* ---------- Meta (preferences, streak) ---------- */
    async getMeta(key, fallback) {
      const store = await tx(META, 'readonly');
      const row = await asPromise(store.get(key));
      return row ? row.value : fallback;
    },
    async setMeta(key, value) {
      const store = await tx(META, 'readwrite');
      return asPromise(store.put({ key, value }));
    },

    /* ---------- Backup / restore (privacidade: export local) ---------- */
    async exportAll() {
      const tasks = await this.all();
      const theme = await this.getMeta('theme', 'auto');
      const streak = await this.getMeta('streak', null);
      return { version: DB_VERSION, exportedAt: new Date().toISOString(), tasks, meta: { theme, streak } };
    },
    async importAll(data) {
      if (!data || !Array.isArray(data.tasks)) throw new Error('Arquivo inválido');
      const store = await tx(STORE, 'readwrite');
      await Promise.all(data.tasks.map(t => asPromise(store.put(t))));
      if (data.meta) {
        if (data.meta.theme) await this.setMeta('theme', data.meta.theme);
        if (data.meta.streak) await this.setMeta('streak', data.meta.streak);
      }
    }
  };

  global.EisenDB = DB;
})(window);
