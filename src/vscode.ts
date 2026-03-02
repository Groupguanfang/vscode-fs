import type { FileSystem, IsDirectory, IsFile, IsSymbolicLink } from './types'
import * as vscode from 'vscode'
import { createNodeFileSystem } from './node'

export async function createVSCodeFileSystem(): Promise<FileSystem> {
  const nodeFileSystem = createNodeFileSystem()

  return {
    stat: async uri => await vscode.workspace.fs.stat(uri),
    readDirectory: async uri => await vscode.workspace.fs.readDirectory(uri),
    createDirectory: async uri => await vscode.workspace.fs.createDirectory(uri),
    readFile: async uri => await vscode.workspace.fs.readFile(uri),
    writeFile: async (uri, content) => await vscode.workspace.fs.writeFile(uri, content),
    delete: async uri => await vscode.workspace.fs.delete(uri),
    rename: async (source, target, options) => await vscode.workspace.fs.rename(source, target, options),
    copy: async (source, target, options) => await vscode.workspace.fs.copy(source, target, options),
    isDirectory: async uri => await vscode.workspace.fs.stat(uri).then(
      stat => stat.type === vscode.FileType.Directory ? stat as IsDirectory : false,
      () => false,
    ),
    isFile: async uri => await vscode.workspace.fs.stat(uri).then(
      stat => stat.type === vscode.FileType.File ? stat as IsFile : false,
      () => false,
    ),
    isSymbolicLink: async uri => await vscode.workspace.fs.stat(uri).then(
      stat => stat.type === vscode.FileType.SymbolicLink ? stat as IsSymbolicLink : false,
      () => false,
    ),
    exists: async uri => await vscode.workspace.fs.stat(uri).then(
      stat => stat,
      () => false,
    ),
    glob: async (pattern, options) => await vscode.workspace.findFiles(
      new vscode.RelativePattern(pattern.baseUri, pattern.pattern),
      options?.ignore
        ? Array.isArray(options.ignore)
          ? null
          : new vscode.RelativePattern(options.ignore.baseUri, options.ignore.pattern)
        : null,
    ),
    createWatcher: async (pattern, options) => {
      const watcher: vscode.FileSystemWatcher & { isDisposed: boolean } = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(pattern.baseUri, pattern.pattern),
        options?.ignoreChangeEvents,
        options?.ignoreChangeEvents,
        options?.ignoreDeleteEvents,
      ) as vscode.FileSystemWatcher & { isDisposed: boolean }
      watcher.isDisposed = false
      const oldDispose = watcher.dispose
      watcher.dispose = function () {
        oldDispose.call(watcher)
        watcher.isDisposed = true
      }
      return watcher
    },
    createWritableStream: async (uri, options) => (await nodeFileSystem).createWritableStream(uri, options),
    createReadableStream: async uri => (await nodeFileSystem).createReadableStream(uri),
  }
}
