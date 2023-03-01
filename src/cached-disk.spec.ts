import { Config, ConfigNotFoundError, createService, dependency, streamToBuffer } from '@foal/core';
import { FileDoesNotExist, LocalDisk } from '@foal/storage';
import { strictEqual } from 'assert';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CachedDisk } from './cached-disk';

function rmDirAndFilesIfExist(path: string) {
    if (!existsSync(path)) {
        return;
    }

    const files = readdirSync(path);

    for (const file of files) {
        const stats = statSync(join(path, file));

        if (stats.isDirectory()) {
            rmDirAndFilesIfExist(join(path, file));
        } else {
            unlinkSync(join(path, file));
        }
    }

    rmdirSync(path);
}

describe('AbstractCachedDisk', () => {
    let disk: CachedDisk<LocalDisk>;

    class Disk extends CachedDisk<LocalDisk> {
        @dependency
        protected disk: LocalDisk;

        constructor(localDisk: LocalDisk) {
            super();
            this.disk = localDisk;
        }
    }

    beforeEach(() => {
        Config.set('settings.disk.local.directory', 'uploaded');
        Config.set('settings.disk.cache.directory', 'cache');
        if (!existsSync('cache')) {
            mkdirSync('cache');
        }
        if (!existsSync('uploaded')) {
            mkdirSync('uploaded');
        }
        if (!existsSync('uploaded/foo')) {
            mkdirSync('uploaded/foo');
        }

        disk = createService(Disk);
    });
    afterEach(() => {
        Config.remove('settings.disk.local.directory');
        Config.remove('settings.disk.cache.directory');
        rmDirAndFilesIfExist('uploaded');
        rmDirAndFilesIfExist('cache');
    });

    describe('has a "read" method that', () => {
        it('should throw an ConfigNotFoundError if no directory is specified in the config.', async () => {
            Config.remove('settings.disk.cache.directory');

            try {
                await disk.read('foo/test.txt', 'buffer');
                throw new Error('An error should have been thrown.');
            } catch (error: any) {
                if (!(error instanceof ConfigNotFoundError)) {
                    throw new Error('A ConfigNotFoundError should have been thrown');
                }
                strictEqual(error.key, 'settings.disk.cache.directory');
                strictEqual(error.msg, 'You must provide a directory name when using cached storage (CachedDisk).');
            }
        });

        describe('should read the file at the given path (buffer)', () => {
            let file: Buffer;
            beforeEach(async () => {
                writeFileSync('uploaded/foo/test.txt', 'hello', 'utf8');
                strictEqual(existsSync('uploaded/foo/test.txt'), true);

                const { file: readFile } = await disk.read('foo/test.txt', 'buffer');
                file = readFile;
            });

            it('should return the file from Disk on first read', () => {
                strictEqual(file.toString('utf8'), 'hello');
            });

            it('should cache the file one first read.', async () => {
                await new Promise(resolve => setTimeout(resolve, 30));
                const cachedFilePath = readdirSync('cache').find(file => !file.match('cache'));
                if (!cachedFilePath) throw new Error('No cached file found.');
                strictEqual(readFileSync(join('cache', cachedFilePath), 'utf8'), 'hello');
            });

            it('should return the cached file one second read.', async () => {
                await new Promise(resolve => setTimeout(resolve, 30));
                const cachedFilePath = readdirSync('cache').find(file => !file.match('cache'));
                if (!cachedFilePath) throw new Error('No cached file found.');
                writeFileSync(join('cache', cachedFilePath), 'world', 'utf8');

                const { file: cachedFile } = await disk.read('foo/test.txt', 'buffer');
                strictEqual(cachedFile.toString('utf8'), 'world');
            });

            it('should return the file from Disk if the cache file does not exist and cache it again.', async () => {
                await new Promise(resolve => setTimeout(resolve, 30));
                let cachedFilePath = readdirSync('cache').find(file => !file.match('cache'));
                if (!cachedFilePath) throw new Error('No cached file found.');
                unlinkSync(join('cache', cachedFilePath));
                strictEqual(existsSync(cachedFilePath), false);

                const { file: cachedFile } = await disk.read('foo/test.txt', 'buffer');
                strictEqual(cachedFile.toString('utf8'), 'hello');

                await new Promise(resolve => setTimeout(resolve, 30));
                cachedFilePath = readdirSync('cache').find(file => !file.match('cache'));
                if (!cachedFilePath) throw new Error('No cached file found.');
                strictEqual(readFileSync(join('cache', cachedFilePath), 'utf8'), 'hello');
            });
        });

        describe('should read the file at the given path (stream)', () => {
            let file: Buffer;
            beforeEach(async () => {
                writeFileSync('uploaded/foo/test.txt', 'hello', 'utf8');
                strictEqual(existsSync('uploaded/foo/test.txt'), true);

                const { file: stream } = await disk.read('foo/test.txt', 'stream');
                const buffer = await streamToBuffer(stream);
                file = buffer;
            });

            it('should return the file from Disk on first read', () => {
                strictEqual(file.toString('utf8'), 'hello');
            });

            it('should cache the file one first read.', async () => {
                await new Promise(resolve => setTimeout(resolve, 30));
                const cachedFilePath = readdirSync('cache').find(file => !file.match('cache'));
                if (!cachedFilePath) throw new Error('No cached file found.');
                strictEqual(readFileSync(join('cache', cachedFilePath), 'utf8'), 'hello');
            });

            it('should return the cached file one second read.', async () => {
                await new Promise(resolve => setTimeout(resolve, 30));
                const cachedFilePath = readdirSync('cache').find(file => !file.match('cache'));
                if (!cachedFilePath) throw new Error('No cached file found.');
                writeFileSync(join('cache', cachedFilePath), 'world', 'utf8');

                const { file: stream } = await disk.read('foo/test.txt', 'stream');
                const cachedFile = await streamToBuffer(stream);
                strictEqual(cachedFile.toString('utf8'), 'world');
            });

            it('should return the file from Disk if the cache file does not exist and cache it again.', async () => {
                await new Promise(resolve => setTimeout(resolve, 30));
                let cachedFilePath = readdirSync('cache').find(file => !file.match('cache'));
                if (!cachedFilePath) throw new Error('No cached file found.');
                unlinkSync(join('cache', cachedFilePath));
                strictEqual(existsSync(cachedFilePath), false);

                const { file: stream } = await disk.read('foo/test.txt', 'stream');
                const cachedFile = await streamToBuffer(stream);
                strictEqual(cachedFile.toString('utf8'), 'hello');

                await new Promise(resolve => setTimeout(resolve, 30));
                cachedFilePath = readdirSync('cache').find(file => !file.match('cache'));
                if (!cachedFilePath) throw new Error('No cached file found.');
                strictEqual(readFileSync(join('cache', cachedFilePath), 'utf8'), 'hello');
            });
        });
    });

    describe('has a "delete" method that', () => {
        it('should throw an ConfigNotFoundError if no directory is specified in the config.', async () => {
            Config.remove('settings.disk.cache.directory');

            try {
                await disk.delete('foo');
                throw new Error('An error should have been thrown.');
            } catch (error: any) {
                if (!(error instanceof ConfigNotFoundError)) {
                    throw new Error('A ConfigNotFoundError should have been thrown');
                }
                strictEqual(error.key, 'settings.disk.cache.directory');
                strictEqual(error.msg, 'You must provide a directory name when using cached storage (CachedDisk).');
            }
        });

        it('should delete the file at the given path and the cached version.', async () => {
            writeFileSync('uploaded/foo/test.txt', 'hello', 'utf8');
            strictEqual(existsSync('uploaded/foo/test.txt'), true);
            await disk.read('foo/test.txt', 'buffer');

            await new Promise(resolve => setTimeout(resolve, 30));
            const cachedFilePath = readdirSync('cache').find(file => !file.match('cache'));
            if (!cachedFilePath) throw new Error('No cached file found.');
            strictEqual(existsSync(join('cache', cachedFilePath)), true);

            await disk.delete('foo/test.txt');
            strictEqual(existsSync('uploaded/foo/test.txt'), false);
            strictEqual(existsSync(join('cache', cachedFilePath)), false);
        });

        it('should throw a FileDoesNotExist if there is no file at the given path.', async () => {
            try {
                await disk.delete('foo/test.txt');
                throw new Error('An error should have been thrown.');
            } catch (error: any) {
                if (!(error instanceof FileDoesNotExist)) {
                    throw new Error('The method should have thrown a FileDoesNotExist error.');
                }
                strictEqual(error.filename, 'foo/test.txt');
            }
        });
    });
});
