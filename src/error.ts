import type { FileSystemError } from './types'
import { FileSystemProviderErrorCode } from './types'

export class FileSystemErrorImpl extends Error implements FileSystemError {
  static create(error: Error | string, code: FileSystemProviderErrorCode): FileSystemError {
    const providerError = new FileSystemErrorImpl(error.toString(), code)
    this.markAsFileSystemProviderError(providerError, code)

    return providerError
  }

  private static markAsFileSystemProviderError(error: Error, code: FileSystemProviderErrorCode): Error {
    error.name = code ? `${code} (FileSystemError)` : `FileSystemError`

    return error
  }

  private constructor(message: string, readonly code: FileSystemProviderErrorCode) {
    super(message)
  }
}

export function createFileSystemError(error: Error | string, code: FileSystemProviderErrorCode): FileSystemError {
  return FileSystemErrorImpl.create(error, code)
}

export function toFileSystemError(error: NodeJS.ErrnoException): FileSystemError {
  let resultError: Error | string = error
  let code: FileSystemProviderErrorCode
  switch (error.code) {
    case 'ENOENT':
      code = FileSystemProviderErrorCode.FileNotFound
      break
    case 'EISDIR':
      code = FileSystemProviderErrorCode.FileIsADirectory
      break
    case 'ENOTDIR':
      code = FileSystemProviderErrorCode.FileNotADirectory
      break
    case 'EEXIST':
      code = FileSystemProviderErrorCode.FileExists
      break
    case 'EPERM':
    case 'EACCES':
      code = FileSystemProviderErrorCode.NoPermissions
      break
    case 'ERR_UNC_HOST_NOT_ALLOWED':
      resultError = `${error.message}. Please update the 'security.allowedUNCHosts' setting if you want to allow this host.`
      code = FileSystemProviderErrorCode.Unknown
      break
    default:
      code = FileSystemProviderErrorCode.Unknown
  }

  return createFileSystemError(resultError, code)
}
