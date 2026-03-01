import type { FSWatcher } from 'chokidar'
import type { Disposable, FileSystem, FileSystemWatcher } from './types'
import { URI, Utils } from 'vscode-uri'
import { createFileSystemError, toFileSystemError } from './error'
import { FileSystemError, FileSystemProviderErrorCode, FileType } from './types'

type StatsLike = import('node:fs').Stats | import('node:fs').Dirent

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err !== null && typeof err === 'object' && 'code' in err
}

function toFileType(stats: StatsLike): FileType {
  if (stats.isFile()) return FileType.File
  if (stats.isDirectory()) return FileType.Directory
  if (stats.isSymbolicLink()) return FileType.SymbolicLink
  return FileType.Unknown
}

async function wrap<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  }
  catch (error) {
    if (FileSystemError.isFileSystemError(error)) throw error
    throw toFileSystemError(error)
  }
}

function joinPath(basePath: string, ...segments: string[]): string {
  return Utils.joinPath(URI.file(basePath), ...segments).fsPath
}

export async function createNodeFileSystem(): Promise<FileSystem> {
  const [fs, trash, glob, watch, stream] = await Promise.all([
    import('node:fs'),
    import('trash').then(m => m.default),
    import('tinyglobby').then(m => m.glob),
    import('chokidar').then(m => m.watch),
    import('node:stream'),
  ])

  async function resolveFileType(path: string): Promise<{ type: FileType, stats: import('node:fs').Stats }> {
    const lstats = await fs.promises.lstat(path)
    if (!lstats.isSymbolicLink()) return { type: toFileType(lstats), stats: lstats }

    let targetStats: import('node:fs').Stats | null = null
    try {
      targetStats = await fs.promises.stat(path)
    }
    catch {
      // Broken symlink
    }
    const baseType = targetStats ? toFileType(targetStats) : FileType.Unknown
    const stats = targetStats ?? lstats
    return { type: baseType | FileType.SymbolicLink, stats }
  }

  async function getEntryType(dirPath: string, entry: import('node:fs').Dirent): Promise<FileType> {
    if (!entry.isSymbolicLink()) return toFileType(entry)
    try {
      const targetStats = await fs.promises.stat(joinPath(dirPath, entry.name))
      return toFileType(targetStats) | FileType.SymbolicLink
    }
    catch {
      return FileType.SymbolicLink
    }
  }

  async function ensureTargetNotExists(path: string): Promise<void> {
    try {
      await fs.promises.access(path, fs.constants.F_OK)
      throw createFileSystemError(`File exists: ${path}`, FileSystemProviderErrorCode.FileExists)
    }
    catch (err: unknown) {
      if (isErrnoException(err) && err.code !== 'ENOENT') throw err
    }
  }

  async function copyRecursive(sourcePath: string, targetPath: string, overwrite: boolean): Promise<void> {
    const stats = await fs.promises.stat(sourcePath)
    if (stats.isFile()) {
      const mode = overwrite ? undefined : fs.constants.COPYFILE_EXCL
      await fs.promises.copyFile(sourcePath, targetPath, mode)
      return
    }
    if (stats.isDirectory()) {
      if (!overwrite) await ensureTargetNotExists(targetPath)
      await fs.promises.mkdir(targetPath, { recursive: true })
      const entries = await fs.promises.readdir(sourcePath, { withFileTypes: true })
      for (const entry of entries) {
        await copyRecursive(joinPath(sourcePath, entry.name), joinPath(targetPath, entry.name), overwrite)
      }
      return
    }
    throw createFileSystemError(`Unsupported file type: ${sourcePath}`, FileSystemProviderErrorCode.Unknown)
  }

  function pathToUris(pathToUris: string[]): URI[] {
    return pathToUris.map(path => URI.file(path))
  }

  return {
    stat: uri => wrap(async () => {
      const { type, stats } = await resolveFileType(uri.fsPath)
      return {
        type,
        ctime: stats.birthtime.getTime(),
        mtime: stats.mtime.getTime(),
        size: stats.size,
      }
    }),
    readDirectory: uri => wrap(async () => {
      const entries = await fs.promises.readdir(uri.fsPath, { withFileTypes: true })
      return Promise.all(entries.map(async entry => [entry.name, await getEntryType(uri.fsPath, entry)]))
    }),
    createDirectory: uri => wrap(async () => {
      await fs.promises.mkdir(uri.fsPath, { recursive: true })
    }),
    readFile: uri => wrap(() => fs.promises.readFile(uri.fsPath)),
    writeFile: (uri, content) => wrap(() => fs.promises.writeFile(uri.fsPath, content)),
    delete: (uri, options) => wrap(async () => {
      if (options?.useTrash) await trash(uri.fsPath)
      else await fs.promises.rm(uri.fsPath, { recursive: options?.recursive })
    }),
    rename: (source, target, options) => wrap(async () => {
      if (options?.overwrite === false) await ensureTargetNotExists(target.fsPath)
      await fs.promises.rename(source.fsPath, target.fsPath)
    }),
    copy: (source, target, options) => wrap(async () => {
      const overwrite = options?.overwrite !== false
      await copyRecursive(source.fsPath, target.fsPath, overwrite)
    }),
    isFile: async (uri) => {
      try {
        const { type, stats } = await resolveFileType(uri.fsPath)
        if (type !== FileType.File) return false
        return {
          type,
          ctime: stats.birthtime.getTime(),
          mtime: stats.mtime.getTime(),
          size: stats.size,
        }
      }
      catch {
        return false
      }
    },
    isDirectory: async (uri) => {
      try {
        const { type, stats } = await resolveFileType(uri.fsPath)
        if (type !== FileType.Directory) return false
        return {
          type,
          ctime: stats.birthtime.getTime(),
          mtime: stats.mtime.getTime(),
          size: stats.size,
        }
      }
      catch {
        return false
      }
    },
    isSymbolicLink: async (uri) => {
      try {
        const { type, stats } = await resolveFileType(uri.fsPath)
        if (type !== FileType.SymbolicLink) return false
        return {
          type,
          ctime: stats.birthtime.getTime(),
          mtime: stats.mtime.getTime(),
          size: stats.size,
        }
      }
      catch {
        return false
      }
    },
    exists: async (uri) => {
      try {
        const { type, stats } = await resolveFileType(uri.fsPath)
        return {
          type,
          ctime: stats.birthtime.getTime(),
          mtime: stats.mtime.getTime(),
          size: stats.size,
        }
      }
      catch {
        return false
      }
    },
    glob: async (pattern, options) => {
      return pathToUris(
        await glob(pattern.pattern, {
          absolute: true,
          cwd: pattern.baseUri.fsPath,
          onlyFiles: options?.onlyFiles,
          onlyDirectories: options?.onlyDirectories,
          followSymbolicLinks: options?.followSymbolicLinks,
          ignore: options?.ignore,
          dot: options?.dot,
          expandDirectories: options?.expandDirectories,
          extglob: options?.extglob,
          deep: options?.deep,
          fs,
        }),
      )
    },
    createWatcher: async (pattern, options) => {
      const watcher = watch(pattern.pattern, {
        cwd: pattern.baseUri.fsPath,
      })

      return new Promise<FileSystemWatcher>((resolve) => {
        watcher.on('ready', () => {
          const fileSystemWatcher = new NodeFileSystemWatcherImpl(watcher, options)

          if (options?.ignoreChangeEvents !== true) watcher.on('add', path => fileSystemWatcher.onDidCreateListeners.forEach(listener => listener(URI.file(path))))
          if (options?.ignoreChangeEvents !== true) watcher.on('change', path => fileSystemWatcher.onDidChangeListeners.forEach(listener => listener(URI.file(path))))
          if (options?.ignoreDeleteEvents !== true) watcher.on('unlink', path => fileSystemWatcher.onDidDeleteListeners.forEach(listener => listener(URI.file(path))))

          resolve(fileSystemWatcher)
        })
      })
    },
    createWritableStream: async (uri, options) => {
      const writableStream = fs.createWriteStream(uri.fsPath, {
        ...options,
        encoding: options?.encoding as NodeJS.BufferEncoding,
        flags: options?.flags,
      })
      return stream.Writable.toWeb(writableStream)
    },
    createReadableStream: async (uri) => {
      const readableStream = fs.createReadStream(uri.fsPath)
      return stream.Readable.toWeb(readableStream) as ReadableStream<Uint8Array>
    },
  }
}

class NodeFileSystemWatcherImpl implements FileSystemWatcher {
  constructor(
    private readonly watcher: FSWatcher,
    private readonly options: Parameters<FileSystem['createWatcher']>[1],
  ) {}

  get ignoreChangeEvents(): boolean {
    return this.options?.ignoreChangeEvents ?? false
  }

  get ignoreCreateEvents(): boolean {
    return this.options?.ignoreCreateEvents ?? false
  }

  get ignoreDeleteEvents(): boolean {
    return this.options?.ignoreDeleteEvents ?? false
  }

  get isDisposed(): boolean {
    return this.watcher.closed
  }

  public readonly onDidCreateListeners = new Set<((e: URI) => unknown)>()
  public readonly onDidChangeListeners = new Set<(e: URI) => unknown>()
  public readonly onDidDeleteListeners = new Set<(e: URI) => unknown>()

  onDidCreate(listener: (e: URI) => unknown): Disposable {
    this.onDidCreateListeners.add(listener)
    return {
      dispose: () => this.onDidCreateListeners.delete(listener),
    }
  }

  onDidChange(listener: (e: URI) => unknown): Disposable {
    this.onDidChangeListeners.add(listener)
    return {
      dispose: () => this.onDidChangeListeners.delete(listener),
    }
  }

  onDidDelete(listener: (e: URI) => unknown): Disposable {
    this.onDidDeleteListeners.add(listener)
    return {
      dispose: () => this.onDidDeleteListeners.delete(listener),
    }
  }

  dispose(): void {
    this.watcher.close()
  }
}
