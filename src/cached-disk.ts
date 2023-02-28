import { Config } from '@foal/core';
import { Disk } from '@foal/storage';
import { randomUUID } from 'crypto';
import { createReadStream, createWriteStream, readFile, stat, unlink, writeFile } from 'fs';
import { join } from 'path';
import { pipeline, Readable } from 'stream';
import { promisify } from 'util';

type Type<C extends 'buffer' | 'stream'> = C extends 'buffer' ? Buffer : C extends 'stream' ? Readable : never;

export abstract class CachedDisk<D extends Disk> extends Disk {
    protected abstract disk: D;

    private cache: { [path: string]: { cachedPath: string; size: number; lastAccess: number } } = {};
    private size = 0;
    private isCleaning = false;

    write(
        dirname: string,
        content: Buffer | Readable,
        options?: { name?: string | undefined } | { extension?: string | undefined } | undefined
    ): Promise<{ path: string }> {
        return this.disk.write(dirname, content, options);
    }

    read<C extends 'buffer' | 'stream'>(path: string, content: C): Promise<{ file: Type<C>; size: number }> {
        if (this.isCached(path)) {
            return this.getFromCache(path, content);
        }
        const promise = this.disk.read(path, content);
        this.setToCache(path, promise);
        return promise;
    }

    readSize(path: string): Promise<number> {
        return this.disk.readSize(path);
    }

    delete(path: string): Promise<void> {
        if (this.isCached(path)) {
            promisify(unlink)(this.cache[path].cachedPath);
            this.size -= this.cache[path].size;
            delete this.cache[path];
        }
        return this.disk.delete(path);
    }

    private isCached(path: string): boolean {
        return !!this.cache[path];
    }

    private async getFromCache<C extends 'buffer' | 'stream'>(
        path: string,
        content: C
    ): Promise<{ file: Type<C>; size: number }> {
        try {
            const { size } = await promisify(stat)(this.cache[path].cachedPath);

            this.cache[path].lastAccess = Date.now();

            if (content === 'buffer') {
                return {
                    file: (await promisify(readFile)(this.cache[path].cachedPath)) as any,
                    size,
                };
            }

            return {
                file: createReadStream(this.cache[path].cachedPath)
                    // Do not kill the process (and crash the server) if the stream emits an error.
                    // Note: users can still add other listeners to the stream to "catch" the error.
                    // Note: error streams are unlikely to occur (most "createWriteStream" errors are simply thrown).
                    // TODO: test this line.
                    .on('error', () => {}) as any,
                size,
            };
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                await promisify(unlink)(this.cache[path].cachedPath).catch(() => {});
                this.size -= this.cache[path].size;
                delete this.cache[path];
                return this.read(path, content);
            }
            // TODO: test this line.
            throw error;
        }
    }

    private async setToCache(
        path: string,
        content: Promise<{ file: Type<'buffer' | 'stream'>; size: number }>
    ): Promise<void> {
        const { file, size } = await content;

        if (!!this.isCleaning && this.size + size > Config.get('cache.maxSize', 'number', 1000000000)) {
            this.cleanCache().catch(() => {
                this.size = Object.keys(this.cache).reduce((acc, path) => acc + this.cache[path].size, 0);
                this.isCleaning = false;
            });
        }

        const name = randomUUID();
        const cachedPath = join(Config.get('cache.path', 'string', 'cache'), name);

        if (file instanceof Buffer) {
            await promisify(writeFile)(cachedPath, file);
        } else {
            await promisify(pipeline)(file, createWriteStream(cachedPath));
        }

        this.cache[path] = { cachedPath, size, lastAccess: Date.now() };
    }

    private async cleanCache(): Promise<void> {
        if (this.isCleaning) return;
        this.isCleaning = true;

        const now = Date.now();
        const cache = Object.keys(this.cache)
            .map(path => ({ path, ...this.cache[path] }))
            .sort((a, b) => a.lastAccess - b.lastAccess);

        let cacheSize = cache.reduce((acc, { size }) => acc + size, 0);

        while (cacheSize > Config.get('cache.maxSize', 'number', 1000000000) * 0.75) {
            const toDelete = cache.shift();
            if (!toDelete) break;
            await promisify(unlink)(toDelete.cachedPath);
            delete this.cache[toDelete.path];
            cacheSize -= toDelete.size;
        }

        this.size = cacheSize;

        this.isCleaning = false;
    }
}
