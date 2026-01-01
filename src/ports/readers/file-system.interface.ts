/**
 * File System Interface
 *
 * Abstraction over filesystem operations to allow testing
 * and potential future cloud storage support.
 */

/**
 * File statistics
 */
export interface FileStats {
  isFile: boolean;
  isDirectory: boolean;
  size: number;
  mtime: Date;
  ctime: Date;
}

/**
 * Directory entry
 */
export interface DirectoryEntry {
  name: string;
  path: string;
  isFile: boolean;
  isDirectory: boolean;
}

export interface IFileSystem {
  /**
   * Read a file as a string
   * @param path Absolute path to the file
   * @returns File contents as string
   * @throws If file doesn't exist or can't be read
   */
  readFile(path: string): Promise<string>;

  /**
   * Read the first N bytes of a file (for quick metadata extraction)
   * @param path Absolute path to the file
   * @param bytes Number of bytes to read
   * @returns Buffer with file contents
   */
  readFileHead(path: string, bytes: number): Promise<Buffer>;

  /**
   * Write a file
   * @param path Absolute path
   * @param content Content to write
   */
  writeFile(path: string, content: string): Promise<void>;

  /**
   * Check if a file or directory exists
   * @param path Path to check
   */
  exists(path: string): Promise<boolean>;

  /**
   * Get file/directory statistics
   * @param path Path to stat
   */
  stat(path: string): Promise<FileStats>;

  /**
   * Read directory contents
   * @param path Directory path
   * @returns List of directory entries
   */
  readdir(path: string): Promise<DirectoryEntry[]>;

  /**
   * Create a directory (and parents if needed)
   * @param path Directory path
   */
  mkdir(path: string): Promise<void>;

  /**
   * Delete a file
   * @param path File path
   */
  unlink(path: string): Promise<void>;

  /**
   * Get the user's home directory path
   */
  homedir(): string;

  /**
   * Join path segments
   * @param segments Path segments to join
   */
  join(...segments: string[]): string;

  /**
   * Get the directory name from a path
   * @param filePath The path
   */
  dirname(filePath: string): string;

  /**
   * Get the base name from a path
   * @param filePath The path
   */
  basename(filePath: string): string;

  /**
   * Create a symbolic link
   * @param target The target file the symlink points to
   * @param path The path where the symlink will be created
   */
  symlink(target: string, path: string): Promise<void>;

  /**
   * Read the target of a symbolic link
   * @param path The symlink path
   * @returns The target path
   */
  readlink(path: string): Promise<string>;

  /**
   * Check if a path is a symbolic link
   * @param path The path to check
   */
  isSymlink(path: string): Promise<boolean>;

  /**
   * Change file permissions
   * @param path The file path
   * @param mode The permission mode (e.g., 0o755)
   */
  chmod(path: string, mode: number): Promise<void>;

  /**
   * Copy a file from source to destination
   * @param src Source file path
   * @param dest Destination file path
   */
  copyFile(src: string, dest: string): Promise<void>;
}
