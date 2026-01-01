/**
 * Language Extractor - Pure Functions
 *
 * Detects programming languages from file extensions and paths.
 * No external dependencies - pure string processing.
 */

/**
 * Mapping of file extensions to programming language names.
 * Comprehensive list covering common languages.
 */
export const LANGUAGE_MAPPINGS: Record<string, string> = {
  // JavaScript ecosystem
  js: 'JavaScript',
  jsx: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',

  // TypeScript
  ts: 'TypeScript',
  tsx: 'TypeScript',
  mts: 'TypeScript',
  cts: 'TypeScript',

  // Python
  py: 'Python',
  pyw: 'Python',
  pyi: 'Python',

  // Web technologies
  html: 'HTML',
  htm: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  sass: 'Sass',
  less: 'Less',

  // Data formats
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  toml: 'TOML',
  xml: 'XML',

  // Markdown
  md: 'Markdown',
  mdx: 'Markdown',

  // Shell scripting
  sh: 'Shell',
  bash: 'Bash',
  zsh: 'Zsh',
  ps1: 'PowerShell',
  bat: 'Batch',
  cmd: 'Batch',

  // System languages
  c: 'C',
  h: 'C',
  cpp: 'C++',
  cc: 'C++',
  cxx: 'C++',
  hpp: 'C++',

  // JVM languages
  java: 'Java',
  kt: 'Kotlin',
  kts: 'Kotlin',
  scala: 'Scala',
  groovy: 'Groovy',
  gradle: 'Groovy',

  // .NET languages
  cs: 'C#',
  fs: 'F#',
  vb: 'Visual Basic',

  // Modern systems languages
  rs: 'Rust',
  go: 'Go',
  zig: 'Zig',
  swift: 'Swift',

  // Scripting languages
  rb: 'Ruby',
  php: 'PHP',
  lua: 'Lua',
  pl: 'Perl',
  pm: 'Perl',

  // Functional languages
  hs: 'Haskell',
  elm: 'Elm',
  clj: 'Clojure',
  cljs: 'ClojureScript',
  ex: 'Elixir',
  exs: 'Elixir',
  erl: 'Erlang',

  // Database
  sql: 'SQL',
  pgsql: 'PostgreSQL',

  // Mobile
  dart: 'Dart',
  m: 'Objective-C',
  mm: 'Objective-C',

  // Web frameworks
  vue: 'Vue',
  svelte: 'Svelte',
  astro: 'Astro',

  // Data science
  r: 'R',
  jl: 'Julia',
  ipynb: 'Jupyter Notebook',

  // Infrastructure
  tf: 'Terraform',
  tfvars: 'Terraform',

  // Other
  graphql: 'GraphQL',
  gql: 'GraphQL',
  proto: 'Protocol Buffers',
};

/**
 * Special filename mappings (files without extensions).
 * Case-insensitive matching.
 */
const SPECIAL_FILENAMES: Record<string, string> = {
  dockerfile: 'Docker',
  makefile: 'Makefile',
  cmakelists: 'CMake',
  gemfile: 'Ruby',
  rakefile: 'Ruby',
  podfile: 'Ruby',
  vagrantfile: 'Ruby',
  jenkinsfile: 'Groovy',
};

/**
 * File extensions to explicitly ignore (not programming languages).
 * These are common non-code file types.
 */
export const IGNORED_EXTENSIONS = new Set([
  // Images
  'png',
  'jpg',
  'jpeg',
  'gif',
  'bmp',
  'svg',
  'ico',
  'webp',
  'avif',
  'tiff',
  'tif',
  // Videos
  'mp4',
  'avi',
  'mov',
  'wmv',
  'webm',
  'mkv',
  // Audio
  'mp3',
  'wav',
  'flac',
  'aac',
  'ogg',
  // Documents
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  // Archives
  'zip',
  'tar',
  'gz',
  'rar',
  '7z',
  'bz2',
  // Fonts
  'ttf',
  'otf',
  'woff',
  'woff2',
  'eot',
  // Binary/Data
  'exe',
  'dll',
  'so',
  'dylib',
  'bin',
  'dat',
  'db',
  'sqlite',
  'sqlite3',
  // Certificates
  'pem',
  'crt',
  'key',
  'cer',
  // Logs & Lock files
  'log',
  'lock',
  // Environment
  'env',
  // macOS
  'ds_store',
  // Git files
  'gitignore',
  'gitattributes',
  'gitmodules',
  'gitkeep',
  // NPM
  'npmignore',
  'npmrc',
  // Editor configs
  'editorconfig',
  'prettierrc',
  'prettierignore',
  'eslintignore',
  // Other
  'bak',
  'tmp',
  'temp',
  'cache',
  'swp',
  'swo',
]);

/**
 * Extract the filename from a path (handles both Unix and Windows paths).
 */
function getFilename(filePath: string): string {
  if (!filePath) return '';
  // Handle both forward and back slashes
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || '';
}

/**
 * Extract the extension from a filename.
 * Returns empty string if no extension found.
 */
function getExtension(filename: string): string {
  if (!filename) return '';
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1 || lastDot === 0) return '';
  return filename.slice(lastDot + 1);
}

/**
 * Get the programming language from a file extension.
 *
 * @param ext - File extension (with or without leading dot)
 * @returns Language name or null if not a programming language
 */
export function getLanguageFromExtension(ext: string): string | null {
  if (!ext) return null;

  // Remove leading dot if present
  const cleanExt = ext.startsWith('.') ? ext.slice(1) : ext;
  const lowerExt = cleanExt.toLowerCase();

  // Check if this extension should be ignored
  if (IGNORED_EXTENSIONS.has(lowerExt)) {
    return null;
  }

  // Look up in mappings (case-insensitive)
  return LANGUAGE_MAPPINGS[lowerExt] || null;
}

/**
 * Get the programming language from a file path.
 *
 * @param filePath - Full or relative file path
 * @returns Language name or null if not a programming language
 */
export function getLanguageFromPath(filePath: string): string | null {
  if (!filePath) return null;

  const filename = getFilename(filePath);
  if (!filename) return null;

  // Check for special filenames first (Dockerfile, Makefile, etc.)
  const lowerFilename = filename.toLowerCase();
  if (SPECIAL_FILENAMES[lowerFilename]) {
    return SPECIAL_FILENAMES[lowerFilename];
  }

  // Extract and check extension
  const ext = getExtension(filename);
  if (!ext) return null;

  return getLanguageFromExtension(ext);
}

/**
 * Extract unique languages from an array of file paths.
 *
 * @param filePaths - Array of file paths
 * @returns Sorted array of unique language names
 */
export function extractLanguagesFromPaths(filePaths: string[]): string[] {
  const languages = new Set<string>();

  for (const path of filePaths) {
    const language = getLanguageFromPath(path);
    if (language) {
      languages.add(language);
    }
  }

  return Array.from(languages).sort();
}

/**
 * Get statistics about languages in an array of file paths.
 *
 * @param filePaths - Array of file paths
 * @returns Map of language name to file count
 */
export function getLanguageStatistics(filePaths: string[]): Map<string, number> {
  const stats = new Map<string, number>();

  for (const path of filePaths) {
    const language = getLanguageFromPath(path);
    if (language) {
      stats.set(language, (stats.get(language) || 0) + 1);
    }
  }

  return stats;
}
