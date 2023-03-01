"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CachedDisk = void 0;
const core_1 = require("@foal/core");
const storage_1 = require("@foal/storage");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const stream_1 = require("stream");
const util_1 = require("util");
const Database = require("better-sqlite3");
class CachedDisk extends storage_1.Disk {
    constructor() {
        super(...arguments);
        this.isCleaning = false;
    }
    get db() {
        if (this._db)
            return this._db;
        this._db = new Database(this.getPath(core_1.Config.get('settings.disk.cache.dbName', 'string', 'cache.db')));
        this._db.pragma('journal_mode = WAL');
        this._db.exec('CREATE TABLE IF NOT EXISTS cache (path TEXT PRIMARY KEY, cachedPath TEXT, size INTEGER, lastAccess INTEGER)');
        this._db.exec('CREATE TABLE IF NOT EXISTS cacheSize (id NUMBER PRIMARY KEY, size INTEGER)');
        this._db.exec('INSERT OR IGNORE INTO cacheSize VALUES (1, 0)');
        return this._db;
    }
    write(dirname, content, options) {
        return this.disk.write(dirname, content, options);
    }
    /**
     * Get cached file if it exists, otherwise read the file from the disk and cache it.
     * @param path
     * @param content
     * @returns
     */
    read(path, content) {
        if (this.isCached(path)) {
            return this.getFromCache(path, content);
        }
        const promise = this.disk.read(path, content);
        void this.setToCache(path, promise);
        return promise;
    }
    readSize(path) {
        return this.disk.readSize(path);
    }
    /**
     * Delete the file from the disk and the cache if it exists.
     * @param path
     * @returns
     * @throws
     */
    delete(path) {
        const cacheEntry = this.isCached(path);
        if (cacheEntry) {
            void (0, util_1.promisify)(fs_1.unlink)(this.getPath(cacheEntry.cachedPath)).catch(() => { });
            this.db.prepare('DELETE FROM cache WHERE path = ?').run(path);
            this.db.prepare('UPDATE cacheSize SET size = size - ?').run(cacheEntry.size);
        }
        return this.disk.delete(path);
    }
    /**
     * Check if the file is cached. If it is, return the cache entry.
     * @param path
     * @returns
     */
    isCached(path) {
        return this.db.prepare('SELECT * FROM cache WHERE path = ?').get(path) ?? false;
    }
    /**
     * get the file from the cache. And update the lastAccess field. And total cache size.
     * @param path
     * @param content
     * @returns
     */
    async getFromCache(path, content) {
        const cacheEntry = this.db.prepare('SELECT * FROM cache WHERE path = ?').get(path);
        try {
            if (!cacheEntry) {
                return this.read(path, content);
            }
            const { size } = await (0, util_1.promisify)(fs_1.stat)(this.getPath(cacheEntry.cachedPath));
            this.db.prepare('UPDATE cache SET lastAccess = ? WHERE path = ?').run(Date.now(), path);
            if (content === 'buffer') {
                return {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    file: (await (0, util_1.promisify)(fs_1.readFile)(this.getPath(cacheEntry.cachedPath))),
                    size,
                };
            }
            return {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                file: (0, fs_1.createReadStream)(this.getPath(cacheEntry.cachedPath))
                    // Do not kill the process (and crash the server) if the stream emits an error.
                    // Note: users can still add other listeners to the stream to "catch" the error.
                    // Note: error streams are unlikely to occur (most "createWriteStream" errors are simply thrown).
                    // TODO: test this line.
                    .on('error', () => { }),
                size,
            };
        }
        catch (error) {
            // ? If the file does not exist, delete the cache entry and read the file from the disk.
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (error.code === 'ENOENT') {
                await (0, util_1.promisify)(fs_1.unlink)(this.getPath(cacheEntry.cachedPath)).catch(() => { });
                this.db.prepare('DELETE FROM cache WHERE path = ?').run(path);
                return this.read(path, content);
            }
            // TODO: test this line.
            throw error;
        }
    }
    /**
     * Cache the file.
     * @param path
     * @param content
     */
    async setToCache(path, content) {
        const { file, size } = await content;
        if (!!this.isCleaning &&
            this.db.prepare('SELECT size FROM cacheSize').get() + size >
                core_1.Config.get('settings.disk.cache.maxSize', 'number', 1000000000)) {
            this.cleanCache().catch(() => {
                this.db.prepare('UPDATE cacheSize SET size = (SELECT SUM(size) FROM cache)').run();
                this.isCleaning = false;
            });
        }
        const name = (0, crypto_1.randomUUID)();
        const cachedPath = this.getPath(name);
        if (file instanceof Buffer) {
            await (0, util_1.promisify)(fs_1.writeFile)(cachedPath, file);
        }
        else {
            await (0, util_1.promisify)(stream_1.pipeline)(file, (0, fs_1.createWriteStream)(cachedPath));
        }
        this.db.prepare('UPDATE cacheSize SET size = size + ?').run(size);
        this.db.prepare('INSERT OR REPLACE INTO cache VALUES (?, ?, ?, ?)').run(path, name, size, Date.now());
    }
    /**
     * Clean the cache by deleting the oldest files until the cache size is under 75% of max size.
     */
    async cleanCache() {
        if (this.isCleaning)
            return;
        this.isCleaning = true;
        while (this.db.prepare('SELECT size FROM cacheSize').get() >
            core_1.Config.get('cache.maxSize', 'number', 1000000000) * 0.75) {
            const toDelete = this.db.prepare('SELECT * FROM cache ORDER BY lastAccess ASC LIMIT 1').get();
            if (!toDelete)
                break;
            await (0, util_1.promisify)(fs_1.unlink)(this.getPath(toDelete.cachedPath));
            this.db.prepare('DELETE FROM cache WHERE path = ?').run(toDelete.path);
            this.db.prepare('UPDATE cacheSize SET size = size - ?').run(toDelete.size);
        }
        this.isCleaning = false;
    }
    getPath(path) {
        const directory = core_1.Config.getOrThrow('settings.disk.cache.directory', 'string', 'You must provide a directory name when using cached storage (CachedDisk).');
        return (0, path_1.join)(directory, path);
    }
}
exports.CachedDisk = CachedDisk;
//# sourceMappingURL=cached-disk.js.map