import type { FileSystem } from './types'
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
  const [fs, trash] = await Promise.all([
    import('node:fs'),
    import('trash').then(m => m.default),
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
  }
}
