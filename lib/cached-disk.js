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
class CachedDisk extends storage_1.Disk {
    constructor() {
        super(...arguments);
        this.cache = {};
        this.size = 0;
        this.isCleaning = false;
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
        if (this.isCached(path)) {
            void (0, util_1.promisify)(fs_1.unlink)(this.cache[path].cachedPath);
            this.size -= this.cache[path].size;
            delete this.cache[path];
        }
        return this.disk.delete(path);
    }
    isCached(path) {
        return !!this.cache[path];
    }
    async getFromCache(path, content) {
        try {
            const { size } = await (0, util_1.promisify)(fs_1.stat)(this.cache[path].cachedPath);
            this.cache[path].lastAccess = Date.now();
            if (content === 'buffer') {
                return {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    file: (await (0, util_1.promisify)(fs_1.readFile)(this.cache[path].cachedPath)),
                    size,
                };
            }
            return {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                file: (0, fs_1.createReadStream)(this.cache[path].cachedPath)
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
                await (0, util_1.promisify)(fs_1.unlink)(this.cache[path].cachedPath).catch(() => { });
                this.size -= this.cache[path].size;
                delete this.cache[path];
                return this.read(path, content);
            }
            // TODO: test this line.
            throw error;
        }
    }
    async setToCache(path, content) {
        const { file, size } = await content;
        if (!!this.isCleaning && this.size + size > core_1.Config.get('cache.maxSize', 'number', 1000000000)) {
            this.cleanCache().catch(() => {
                this.size = Object.keys(this.cache).reduce((acc, path) => acc + this.cache[path].size, 0);
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
        this.cache[path] = { cachedPath, size, lastAccess: Date.now() };
    }
    async cleanCache() {
        if (this.isCleaning)
            return;
        this.isCleaning = true;
        const cache = Object.keys(this.cache)
            .map(path => ({ path, ...this.cache[path] }))
            .sort((a, b) => a.lastAccess - b.lastAccess);
        let cacheSize = cache.reduce((acc, { size }) => acc + size, 0);
        while (cacheSize > core_1.Config.get('cache.maxSize', 'number', 1000000000) * 0.75) {
            const toDelete = cache.shift();
            if (!toDelete)
                break;
            await (0, util_1.promisify)(fs_1.unlink)(toDelete.cachedPath);
            delete this.cache[toDelete.path];
            cacheSize -= toDelete.size;
        }
        this.size = cacheSize;
        this.isCleaning = false;
    }
}
exports.CachedDisk = CachedDisk;
//# sourceMappingURL=cached-disk.js.map