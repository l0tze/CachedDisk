# CachedDisk

This is a simple caching layer for [FoalTS Disk](https://foalts.org/docs/common/file-storage/local-and-cloud-storage).
It stores files in local storage after they are first accessed.
It keeps track of the cached files and the cache size in a sqlite database.

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

## Features

- Cache files in local storage

## Non-features

- Update cache when files are modified
- Cache files on upload
- Cache lifetime
