/// <reference types="node" />
/// <reference types="node" />
import { Disk } from '@foal/storage';
import { Readable } from 'stream';
type Type<C extends 'buffer' | 'stream'> = C extends 'buffer' ? Buffer : C extends 'stream' ? Readable : never;
export declare abstract class CachedDisk<D extends Disk> extends Disk {
    protected abstract disk: D;
    private isCleaning;
    private _db;
    private get db();
    write(dirname: string, content: Buffer | Readable, options?: {
        name?: string | undefined;
    } | {
        extension?: string | undefined;
    } | undefined): Promise<{
        path: string;
    }>;
    /**
     * Get cached file if it exists, otherwise read the file from the disk and cache it.
     * @param path
     * @param content
     * @returns
     */
    read<C extends 'buffer' | 'stream'>(path: string, content: C): Promise<{
        file: Type<C>;
        size: number;
    }>;
    readSize(path: string): Promise<number>;
    /**
     * Delete the file from the disk and the cache if it exists.
     * @param path
     * @returns
     * @throws
     */
    delete(path: string): Promise<void>;
    /**
     * Check if the file is cached. If it is, return the cache entry.
     * @param path
     * @returns
     */
    private isCached;
    /**
     * get the file from the cache. And update the lastAccess field. And total cache size.
     * @param path
     * @param content
     * @returns
     */
    private getFromCache;
    /**
     * Cache the file.
     * @param path
     * @param content
     */
    private setToCache;
    /**
     * Clean the cache by deleting the oldest files until the cache size is under 75% of max size.
     */
    private cleanCache;
    private getPath;
}
export {};
