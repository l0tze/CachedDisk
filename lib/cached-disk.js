"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CachedDisk = void 0;
const core_1 = require("@foal/core");
const storage_1 = require("@foal/storage");
const Database = require("better-sqlite3");
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const path_1 = require("path");
const stream_1 = require("stream");
const util_1 = require("util");
class CachedDisk extends storage_1.Disk {
    constructor() {
        super(...arguments);
        /*
        private cache: { [path: string]: { cachedPath: string; size: number; lastAccess: number } } = {};
        private size = 0;
        */
        this.isCleaning = false;
        this.db = new Database('cache/cache.db');
    }
    boot() {
        this.db.pragma('journal_mode = WAL');
        this.db.exec('CREATE TABLE IF NOT EXISTS cache (path TEXT PRIMARY KEY, cachedPath TEXT, size INTEGER, lastAccess INTEGER)');
        this.db.exec('CREATE TABLE IF NOT EXISTS cacheSize (size INTEGER)');
    }
    write(dirname, content, options) {
        return this.disk.write(dirname, content, options);
    }
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
    delete(path) {
        const cacheEntry = this.isCached(path);
        if (cacheEntry) {
            void (0, util_1.promisify)(fs_1.unlink)(cacheEntry.cachedPath).catch(() => { });
            this.db.prepare('DELETE FROM cache WHERE path = ?').run(path);
            this.db.prepare('UPDATE cacheSize SET size = size - ?').run(cacheEntry.size);
        }
        return this.disk.delete(path);
    }
    isCached(path) {
        return this.db.prepare('SELECT * FROM cache WHERE path = ?').get(path) ?? false;
    }
    async getFromCache(path, content) {
        const cacheEntry = this.db.prepare('SELECT * FROM cache WHERE path = ?').get(path);
        try {
            if (!cacheEntry) {
                return this.read(path, content);
            }
            const { size } = await (0, util_1.promisify)(fs_1.stat)(cacheEntry.cachedPath);
            this.db.prepare('UPDATE cache SET lastAccess = ? WHERE path = ?').run(Date.now(), path);
            if (content === 'buffer') {
                return {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    file: (await (0, util_1.promisify)(fs_1.readFile)(cacheEntry.cachedPath)),
                    size,
                };
            }
            return {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                file: (0, fs_1.createReadStream)(cacheEntry.cachedPath)
                    // Do not kill the process (and crash the server) if the stream emits an error.
                    // Note: users can still add other listeners to the stream to "catch" the error.
                    // Note: error streams are unlikely to occur (most "createWriteStream" errors are simply thrown).
                    // TODO: test this line.
                    .on('error', () => { }),
                size,
            };
        }
        catch (error) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (error.code === 'ENOENT') {
                await (0, util_1.promisify)(fs_1.unlink)(cacheEntry.cachedPath).catch(() => { });
                this.db.prepare('DELETE FROM cache WHERE path = ?').run(path);
                return this.read(path, content);
            }
            // TODO: test this line.
            throw error;
        }
    }
    async setToCache(path, content) {
        const { file, size } = await content;
        if (!!this.isCleaning &&
            this.db.prepare('SELECT * FROM size').get() + size >
                core_1.Config.get('cache.maxSize', 'number', 1000000000)) {
            this.cleanCache().catch(() => {
                this.db.prepare('UPDATE cacheSize SET size = (SELECT SUM(size) FROM cache)').run();
                this.isCleaning = false;
            });
        }
        const name = (0, crypto_1.randomUUID)();
        const cachedPath = (0, path_1.join)(core_1.Config.get('cache.path', 'string', 'cache'), name);
        if (file instanceof Buffer) {
            await (0, util_1.promisify)(fs_1.writeFile)(cachedPath, file);
        }
        else {
            await (0, util_1.promisify)(stream_1.pipeline)(file, (0, fs_1.createWriteStream)(cachedPath));
        }
        this.db.prepare('UPDATE cacheSize SET size = size + ?').run(size);
        this.db.prepare('INSERT OR REPLACE INTO cache VALUES (?, ?, ?, ?)').run(path, cachedPath, size, Date.now());
    }
    async cleanCache() {
        if (this.isCleaning)
            return;
        this.isCleaning = true;
        while (this.db.prepare('SELECT * FROM size').get() > core_1.Config.get('cache.maxSize', 'number', 1000000000) * 0.75) {
            const toDelete = this.db.prepare('SELECT * FROM cache ORDER BY lastAccess ASC LIMIT 1').get();
            if (!toDelete)
                break;
            await (0, util_1.promisify)(fs_1.unlink)(toDelete.cachedPath);
            this.db.prepare('DELETE FROM cache WHERE path = ?').run(toDelete.path);
            this.db.prepare('UPDATE cacheSize SET size = size - ?').run(toDelete.size);
        }
        this.isCleaning = false;
    }
}
exports.CachedDisk = CachedDisk;
//# sourceMappingURL=cached-disk.js.map