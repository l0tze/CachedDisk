/// <reference types="node" />
/// <reference types="node" />
import { Disk } from '@foal/storage';
import { Readable } from 'stream';
type Type<C extends 'buffer' | 'stream'> = C extends 'buffer' ? Buffer : C extends 'stream' ? Readable : never;
export declare abstract class CachedDisk<D extends Disk> extends Disk {
    protected abstract disk: D;
    private cache;
    private size;
    private isCleaning;
    write(dirname: string, content: Buffer | Readable, options?: {
        name?: string | undefined;
    } | {
        extension?: string | undefined;
    } | undefined): Promise<{
        path: string;
    }>;
    read<C extends 'buffer' | 'stream'>(path: string, content: C): Promise<{
        file: Type<C>;
        size: number;
    }>;
    readSize(path: string): Promise<number>;
    delete(path: string): Promise<void>;
    private isCached;
    private getFromCache;
    private setToCache;
    private cleanCache;
}
export {};
