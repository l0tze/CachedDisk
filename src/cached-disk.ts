import { Config } from '@foal/core';
import { Disk } from '@foal/storage';
import Database = require('better-sqlite3');
import { randomUUID } from 'crypto';
import { createReadStream, createWriteStream, readFile, stat, unlink, writeFile } from 'fs';
import { join } from 'path';
import { pipeline, Readable } from 'stream';
import { promisify } from 'util';

type Type<C extends 'buffer' | 'stream'> = C extends 'buffer' ? Buffer : C extends 'stream' ? Readable : never;
type CacheEntry = { path: string; cachedPath: string; size: number; lastAccess: number };

export abstract class CachedDisk<D extends Disk> extends Disk {
    protected abstract disk: D;

    /*
    private cache: { [path: string]: { cachedPath: string; size: number; lastAccess: number } } = {};
    private size = 0;
    */
    private isCleaning = false;
    private db = new Database('cache/cache.db');

    boot() {
        this.db.pragma('journal_mode = WAL');
        this.db.exec(
            'CREATE TABLE IF NOT EXISTS cache (path TEXT PRIMARY KEY, cachedPath TEXT, size INTEGER, lastAccess INTEGER)'
        );
        this.db.exec('CREATE TABLE IF NOT EXISTS cacheSize (id NUMBER PRIMARY KEY, size INTEGER)');
        this.db.exec('INSERT OR IGNORE INTO cacheSize VALUES (1, 0)');
    }

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
        void this.setToCache(path, promise);
        return promise;
    }

    readSize(path: string): Promise<number> {
        return this.disk.readSize(path);
    }

    delete(path: string): Promise<void> {
        const cacheEntry = this.isCached(path);
        if (cacheEntry) {
            void promisify(unlink)(cacheEntry.cachedPath).catch(() => {});
            this.db.prepare('DELETE FROM cache WHERE path = ?').run(path);
            this.db.prepare('UPDATE cacheSize SET size = size - ?').run(cacheEntry.size);
        }
        return this.disk.delete(path);
    }

    private isCached(path: string): CacheEntry | false {
        return (this.db.prepare('SELECT * FROM cache WHERE path = ?').get(path) as CacheEntry) ?? false;
    }

    private async getFromCache<C extends 'buffer' | 'stream'>(
        path: string,
        content: C
    ): Promise<{ file: Type<C>; size: number }> {
        const cacheEntry = this.db.prepare('SELECT * FROM cache WHERE path = ?').get(path) as {
            path: string;
            cachedPath: string;
            size: number;
            lastAccess: number;
        };
        try {
            if (!cacheEntry) {
                return this.read(path, content);
            }

            const { size } = await promisify(stat)(cacheEntry.cachedPath);

            this.db.prepare('UPDATE cache SET lastAccess = ? WHERE path = ?').run(Date.now(), path);
            if (content === 'buffer') {
                return {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    file: (await promisify(readFile)(cacheEntry.cachedPath)) as any,
                    size,
                };
            }

            return {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                file: createReadStream(cacheEntry.cachedPath)
                    // Do not kill the process (and crash the server) if the stream emits an error.
                    // Note: users can still add other listeners to the stream to "catch" the error.
                    // Note: error streams are unlikely to occur (most "createWriteStream" errors are simply thrown).
                    // TODO: test this line.
                    .on('error', () => {}) as any,
                size,
            };
        } catch (error: any) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (error.code === 'ENOENT') {
                await promisify(unlink)(cacheEntry.cachedPath).catch(() => {});
                this.db.prepare('DELETE FROM cache WHERE path = ?').run(path);
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

        if (
            !!this.isCleaning &&
            (this.db.prepare('SELECT size FROM cacheSize').get() as number) + size >
                Config.get('cache.maxSize', 'number', 1000000000)
        ) {
            this.cleanCache().catch(() => {
                this.db.prepare('UPDATE cacheSize SET size = (SELECT SUM(size) FROM cache)').run();
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

        this.db.prepare('UPDATE cacheSize SET size = size + ?').run(size);
        this.db.prepare('INSERT OR REPLACE INTO cache VALUES (?, ?, ?, ?)').run(path, cachedPath, size, Date.now());
    }

    private async cleanCache(): Promise<void> {
        if (this.isCleaning) return;
        this.isCleaning = true;

        while (
            (this.db.prepare('SELECT size FROM cacheSize').get() as number) >
            Config.get('cache.maxSize', 'number', 1000000000) * 0.75
        ) {
            const toDelete = this.db.prepare('SELECT * FROM cache ORDER BY lastAccess ASC LIMIT 1').get() as CacheEntry;
            if (!toDelete) break;
            await promisify(unlink)(toDelete.cachedPath);
            this.db.prepare('DELETE FROM cache WHERE path = ?').run(toDelete.path);
            this.db.prepare('UPDATE cacheSize SET size = size - ?').run(toDelete.size);
        }

        this.isCleaning = false;
    }
}
