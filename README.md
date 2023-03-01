# CachedDisk

This is a simple caching layer for [FoalTS Disk](https://foalts.org/docs/common/file-storage/local-and-cloud-storage).
It stores files in local storage after they are first accessed.
It keeps track of the cached files and the cache size in a sqlite database.
Files are identified by their path.

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

```bash
npm install --save @erkoware/cached-disk-foal
```

```typescript
export class CachedLocalDisk extends CachedDisk<LocalDisk> {
    @dependency
    disk: LocalDisk;
}

export { CachedLocalDisk as ConcreteDisk }
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
