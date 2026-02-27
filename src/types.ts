import type { URI as Uri } from 'vscode-uri'
import { FileSystemErrorImpl } from './error'

/**
 * Enumeration of file types. The types `File` and `Directory` can also be
 * a symbolic links, in that case use `FileType.File | FileType.SymbolicLink` and
 * `FileType.Directory | FileType.SymbolicLink`.
 */
export enum FileType {
  /**
   * The file type is unknown.
   */
  Unknown = 0,
  /**
   * A regular file.
   */
  File = 1,
  /**
   * A directory.
   */
  Directory = 2,
  /**
   * A symbolic link to a file.
   */
  SymbolicLink = 64,
}

/**
 * The file system interface exposes the editor's built-in and contributed
 * {@link FileSystemProvider file system providers}. It allows extensions to work
 * with files from the local disk as well as files from remote places, like the
 * remote extension host or ftp-servers.
 */
export interface FileSystem {

  /**
   * Retrieve metadata about a file.
   *
   * @param uri The uri of the file to retrieve metadata about.
   * @returns The file metadata about the file.
   */
  stat(uri: Uri): Promise<FileStat>

  /**
   * Retrieve all entries of a {@link FileType.Directory directory}.
   *
   * @param uri The uri of the folder.
   * @returns An array of name/type-tuples or a thenable that resolves to such.
   */
  readDirectory(uri: Uri): Promise<[string, FileType][]>

  /**
   * Create a new directory (Note, that new files are created via `write`-calls).
   *
   * Note* that missing directories are created automatically, e.g this call has
   * `mkdirp` semantics.
   *
   * @param uri The uri of the new folder.
   */
  createDirectory(uri: Uri): Promise<void>

  /**
   * Read the entire contents of a file.
   *
   * @param uri The uri of the file.
   * @returns An array of bytes or a thenable that resolves to such.
   */
  readFile(uri: Uri): Promise<Uint8Array>

  /**
   * Write data to a file, replacing its entire contents.
   *
   * @param uri The uri of the file.
   * @param content The new content of the file.
   */
  writeFile(uri: Uri, content: Uint8Array): Promise<void>

  /**
   * Delete a file.
   *
   * @param uri The resource that is to be deleted.
   * @param options Defines if trash can should be used and if deletion of folders is recursive
   * @param options.recursive Delete the content recursively if a folder is denoted.
   * @param options.useTrash Use the os's trashcan instead of permanently deleting files whenever possible.
   */
  delete(uri: Uri, options?: {
    /**
     * Delete the content recursively if a folder is denoted.
     */
    recursive?: boolean
    /**
     * Use the os's trashcan instead of permanently deleting files whenever possible.
     */
    useTrash?: boolean
  }): Promise<void>

  /**
   * Rename a file or folder.
   *
   * @param source The existing file.
   * @param target The new location.
   * @param options Defines if existing files should be overwritten.
   * @param options.overwrite Overwrite the file if it does exist.
   */
  rename(source: Uri, target: Uri, options?: {
    /**
     * Overwrite the file if it does exist.
     */
    overwrite?: boolean
  }): Promise<void>

  /**
   * Copy files or folders.
   *
   * @param source The existing file.
   * @param target The destination location.
   * @param options Defines if existing files should be overwritten.
   * @param options.overwrite Overwrite the file if it does exist.
   */
  copy(source: Uri, target: Uri, options?: {
    /**
     * Overwrite the file if it does exist.
     */
    overwrite?: boolean
  }): Promise<void>

  /**
   * Check if a file exists.
   *
   * @param uri The uri of the file.
   * @returns True if the file exists, false otherwise.
   * @throws It will not throw any errors if the file does not exist.
   */
  isFile(uri: Uri): Promise<IsFile | false>

  /**
   * Check if a directory exists.
   *
   * @param uri The uri of the directory.
   * @returns True if the directory exists, false otherwise.
   * @throws It will not throw any errors if the directory does not exist.
   */
  isDirectory(uri: Uri): Promise<IsDirectory | false>

  /**
   * Check if a symbolic link exists.
   *
   * @param uri The uri of the symbolic link.
   * @returns True if the symbolic link exists, false otherwise.
   * @throws It will not throw any errors if the symbolic link does not exist.
   */
  isSymbolicLink(uri: Uri): Promise<IsSymbolicLink | false>

  /**
   * Check if the path is exists.
   *
   * @param uri The uri of the file, directory, or symbolic link.
   * @returns True if the file, directory, or symbolic link exists, false otherwise.
   * @throws It will not throw any errors if the file, directory, or symbolic link does not exist.
   */
  exists(uri: Uri): Promise<FileStat | false>
}

/**
 * The `FileStat`-type represents metadata about a file
 */
export interface FileStat {
  /**
   * The type of the file, e.g. is a regular file, a directory, or symbolic link
   * to a file.
   *
   * Note:* This value might be a bitmask, e.g. `FileType.File | FileType.SymbolicLink`.
   */
  type: FileType
  /**
   * The creation timestamp in milliseconds elapsed since January 1, 1970 00:00:00 UTC.
   */
  ctime: number
  /**
   * The modification timestamp in milliseconds elapsed since January 1, 1970 00:00:00 UTC.
   *
   * Note:* If the file changed, it is important to provide an updated `mtime` that advanced
   * from the previous value. Otherwise there may be optimizations in place that will not show
   * the updated file contents in an editor for example.
   */
  mtime: number
  /**
   * The size in bytes.
   *
   * Note:* If the file changed, it is important to provide an updated `size`. Otherwise there
   * may be optimizations in place that will not show the updated file contents in an editor for
   * example.
   */
  size: number
}

export type IsFile = Omit<FileStat, 'type'> & { type: FileType.File }
export type IsDirectory = Omit<FileStat, 'type'> & { type: FileType.Directory }
export type IsSymbolicLink = Omit<FileStat, 'type'> & { type: FileType.SymbolicLink }

/**
 * A type that filesystem providers should use to signal errors.
 *
 * This class has factory methods for common error-cases, like `FileNotFound` when
 * a file or folder doesn't exist, use them like so: `throw vscode.FileSystemError.FileNotFound(someUri);`
 */
export interface FileSystemError extends Error {
  /**
   * A code that identifies this error.
   *
   * Possible values are names of errors, like {@linkcode FileSystemError.FileNotFound FileNotFound},
   * or `Unknown` for unspecified errors.
   */
  readonly code: string
}

export namespace FileSystemError {
  export function isFileSystemError(error: unknown): error is FileSystemError {
    return error instanceof FileSystemErrorImpl
  }
}

export enum FileSystemProviderErrorCode {
  FileExists = 'EntryExists',
  FileNotFound = 'EntryNotFound',
  FileNotADirectory = 'EntryNotADirectory',
  FileIsADirectory = 'EntryIsADirectory',
  FileExceedsStorageQuota = 'EntryExceedsStorageQuota',
  FileTooLarge = 'EntryTooLarge',
  FileWriteLocked = 'EntryWriteLocked',
  NoPermissions = 'NoPermissions',
  Unavailable = 'Unavailable',
  Unknown = 'Unknown',
}
