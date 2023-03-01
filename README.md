# CachedDisk [MOVED](https://github.com/erkoware/foalts-cached-disk.git)

This package is now maintained by [erkoware](https://github.com/erkoware)

This is a simple caching layer for [FoalTS Disk](https://foalts.org/docs/common/file-storage/local-and-cloud-storage).
It stores files in local storage after they are first accessed.
It keeps track of the cached files and the cache size in a sqlite database.

## BE AWARE

If a file is modified and already cached, the cache is not updated. This means that the file will be read from the cache and not from the disk.

This also applies if a file is deleted without using the `delete` method of the CachedDisk.

## How it works

The cache is a simple LRU cache. It stores the files in a local directory. The cache size is limited by the `cacheSize` option.
The cache is not updated when the file is modified.
One first call to `read` the file is copied to the cache directory and the cache size is updated.
Information about the file is stored in the sqlite database.
On subsequent calls the file is read from the cache directory.
When the cache size is exceeded the least recently used file is removed from the cache, until the cache size is below 75% of `cacheSize` again.

## Features

- Cache files in local storage

## Non-features

- Update cache when files are modified
- Cache files on upload
- Cache lifetime
- Doesn't track file hashes

## Usage Example

We are using a rather slow S3 Service to store our files. And wrote this disk to improve the access times for frequently accessed files.
While still keeping our application stateless.

## Usage

### Prerequisites

read the [documentation](https://foalts.org/docs/common/file-storage/local-and-cloud-storage) from FoalTS on File Storage.

```bash
npm install --save @erkoware/cached-disk-foal
```

### As a specific disk

```typescript
export class CachedLocalDisk extends CachedDisk<LocalDisk> {
    @dependency
    disk: LocalDisk;
}
```

```typescript
class FooController {
    @dependency
    cachedDisk: CachedLocalDisk;

    async bar() {
        const { file } = await this.disk.read('path/to/file');
        // ...
    }
}
```

### As default disk

```typescript
// driver: app/services/cached-local-disk.service.ts
export class CachedLocalDisk extends CachedDisk<LocalDisk> {
    @dependency
    disk: LocalDisk;
}

export { CachedLocalDisk as ConcreteDisk }
```

```javascript
// config/default.js
settings: {
    disk: {
        driver: "./app/services/cached-local-disk.service",
    }
}
```

```typescript
class FooController {
    @dependency
    disk: Disk;

    async bar() {
        const { file } = await this.disk.read('path/to/file');
        // ...
    }
}
```

For more information, see the [documentation](https://foalts.org/docs/common/file-storage/local-and-cloud-storage#implementing-a-disk).

## Options

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `cacheSize` | `number` | `1000000000` | The maximum size of the cache in bytes. |
| `cachePath` | `string` | - | The path to the cache directory. |
| `dbName` | `string` | `cache.db` | The name of the sqlite database. |

## Roadmap

- [ ] Warmup cache on first start
