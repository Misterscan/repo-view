import { FileText, Send, Code2, Download, Image as ImageIcon, Video, Globe, Eye, Code, AlertTriangle } from 'lucide-react';
import Markdown from 'react-markdown';
import { FileNode } from '../types';
import { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import { useIndexerState } from '../store/appState';
import { getSessionFileBlob, getSessionFileContent, getSessionFileMetas } from '../lib/db';

interface FileViewerProps {
  selectedFile: FileNode | null;
  onContextualize: (path: string) => void;
}

export function FileViewer({ selectedFile, onContextualize }: FileViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('preview');
  const [processedHtml, setProcessedHtml] = useState<string>('');
  const [previewWarnings, setPreviewWarnings] = useState<string[]>([]);
  const { currentSessionId } = useIndexerState();

  let typescriptModulePromise: Promise<any> | null = null;
  let sucraseModulePromise: Promise<any> | null = null;

  const isImage = selectedFile?.name.match(/\.(jpg|jpeg|png|gif|webp|bmp|ico|svg)$/i);
  const isVideo = selectedFile?.name.match(/\.(mp4|webm|ogg|mov)$/i);
  const isPdf = selectedFile?.name.toLowerCase().endsWith('.pdf');
  const isHtml = selectedFile?.name.toLowerCase().endsWith('.html');

  const importRuntimeModule = async (specifier: string): Promise<any> => {
    const dynamicImport = new Function('s', 'return import(/* @vite-ignore */ s);') as (s: string) => Promise<any>;
    return dynamicImport(specifier);
  };

  const isLocalPathReference = (value: string) => {
    if (!value) return false;
    const v = value.trim().toLowerCase();
    if (!v || v.startsWith('#')) return false;
    if (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('//') || v.startsWith('data:') || v.startsWith('blob:')) return false;
    return true;
  };

  const resolveRelativePath = (basePath: string, relPath: string) => {
    const baseParts = basePath.split('/');
    baseParts.pop();
    const relParts = relPath.split('/');
    for (const part of relParts) {
      if (!part || part === '.') continue;
      if (part === '..') {
        if (baseParts.length > 0) baseParts.pop();
        continue;
      }
      baseParts.push(part);
    }
    return baseParts.join('/');
  };

  const stripQueryAndHash = (value: string) => value.split('#')[0].split('?')[0];

  const styleModulePattern = /\.(css)$/i;
  const assetModulePattern = /\.(png|jpe?g|gif|webp|bmp|ico|svg|avif|mp4|webm|ogg|mov|mp3|wav|flac|aac|pdf|woff2?|ttf|otf|eot)$/i;

  const getMimeTypeForPath = (path: string) => {
    const lower = path.toLowerCase();
    if (lower.endsWith('.css')) return 'text/css';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.bmp')) return 'image/bmp';
    if (lower.endsWith('.ico')) return 'image/x-icon';
    if (lower.endsWith('.svg')) return 'image/svg+xml';
    if (lower.endsWith('.avif')) return 'image/avif';
    if (lower.endsWith('.mp4')) return 'video/mp4';
    if (lower.endsWith('.webm')) return 'video/webm';
    if (lower.endsWith('.ogg')) return 'application/ogg';
    if (lower.endsWith('.mov')) return 'video/quicktime';
    if (lower.endsWith('.mp3')) return 'audio/mpeg';
    if (lower.endsWith('.wav')) return 'audio/wav';
    if (lower.endsWith('.flac')) return 'audio/flac';
    if (lower.endsWith('.aac')) return 'audio/aac';
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.woff')) return 'font/woff';
    if (lower.endsWith('.woff2')) return 'font/woff2';
    if (lower.endsWith('.ttf')) return 'font/ttf';
    if (lower.endsWith('.otf')) return 'font/otf';
    if (lower.endsWith('.eot')) return 'application/vnd.ms-fontobject';
    return 'application/octet-stream';
  };

  const buildLocalPathCandidates = (basePath: string, refPath: string) => {
    const cleanRef = stripQueryAndHash(refPath).trim();
    if (!cleanRef) return [] as string[];

    const withExtensionFallbacks = (inputPath: string) => {
      const lower = inputPath.toLowerCase();
      const hasKnownExtension = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.css'].some((ext) => lower.endsWith(ext));
      if (hasKnownExtension) {
        return [inputPath];
      }
      return [
        inputPath,
        `${inputPath}.js`,
        `${inputPath}.jsx`,
        `${inputPath}.ts`,
        `${inputPath}.tsx`,
        `${inputPath}.mjs`,
        `${inputPath}/index.js`,
        `${inputPath}/index.jsx`,
        `${inputPath}/index.ts`,
        `${inputPath}/index.tsx`,
        `${inputPath}/index.mjs`,
      ];
    };

    if (cleanRef.startsWith('/')) {
      const withoutLeadingSlash = cleanRef.replace(/^\/+/, '');
      const firstSegment = basePath.includes('/') ? basePath.split('/')[0] : '';
      const candidates = withExtensionFallbacks(withoutLeadingSlash);
      if (firstSegment) {
        candidates.push(...withExtensionFallbacks(`${firstSegment}/${withoutLeadingSlash}`));
      }
      return Array.from(new Set(candidates));
    }

    return withExtensionFallbacks(resolveRelativePath(basePath, cleanRef));
  };

  useEffect(() => {
    if (selectedFile?.blob) {
      const url = URL.createObjectURL(selectedFile.blob);
      setBlobUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setBlobUrl(null);
    }
  }, [selectedFile]);

  useEffect(() => {
    if (!isHtml || !processedHtml) {
      return;
    }
  }, [isHtml, processedHtml]);

  // Reset view mode when file changes
  useEffect(() => {
    const isHtml = selectedFile?.name.toLowerCase().endsWith('.html');
    setViewMode(isHtml ? 'preview' : 'source');
  }, [selectedFile?.path]);

  useEffect(() => {
    let cancelled = false;

    const prepareHtmlPreview = async () => {
      if (!isHtml || !selectedFile?.content || !selectedFile.path || !currentSessionId) {
        setProcessedHtml('');
        setPreviewWarnings([]);
        return;
      }

      const originalHtml = selectedFile.content || '';

      const buildSanitizedFallbackHtml = () => {
        try {
          const fallbackParser = new DOMParser();
          const fallbackDoc = fallbackParser.parseFromString(originalHtml, 'text/html');

          const fallbackScriptNodes = Array.from(fallbackDoc.querySelectorAll('script[src]'));
          for (const script of fallbackScriptNodes) {
            const src = script.getAttribute('src') || '';
            if (isLocalPathReference(src)) {
              script.remove();
            }
          }

          const fallbackLinkNodes = Array.from(fallbackDoc.querySelectorAll('link[href]'));
          for (const link of fallbackLinkNodes) {
            const href = link.getAttribute('href') || '';
            if (!isLocalPathReference(href)) continue;

            const rel = (link.getAttribute('rel') || '').toLowerCase();
            if (rel === 'stylesheet') continue;
            link.remove();
          }

          return fallbackDoc.documentElement ? `<!doctype html>\n${fallbackDoc.documentElement.outerHTML}` : originalHtml;
        } catch {
          return originalHtml;
        }
      };

      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(selectedFile.content, 'text/html');
        const warnings: string[] = [];
        const sourceCache = new Map<string, string | null>();
        const blobCache = new Map<string, Blob | null>();
        const moduleUrlCache = new Map<string, string>();
        let availableSessionPathsPromise: Promise<string[]> | null = null;

        const mapBareImportToCdn = (specifier: string): string => {
          const encoded = encodeURIComponent(specifier);
          return `https://esm.sh/${encoded}`;
        };

        const previewIdbModuleSource = `const previewDbs = globalThis.__previewOpenDbStore ||= new Map();

const makeKey = (value) => JSON.stringify(value);
const cloneValue = (value) => {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
};

const createCursor = (entries, offset = 0) => {
  if (offset >= entries.length) return null;
  const [primaryKey] = entries[offset];
  return {
    primaryKey: cloneValue(primaryKey),
    async continue() {
      return createCursor(entries, offset + 1);
    },
  };
};

const ensureStore = (dbEntry, storeName) => {
  if (!dbEntry.stores.has(storeName)) {
    dbEntry.stores.set(storeName, { keyPath: 'id', records: new Map(), indices: new Map() });
  }
  return dbEntry.stores.get(storeName);
};

const resolveKey = (store, value, explicitKey) => {
  if (explicitKey !== undefined) return explicitKey;
  if (Array.isArray(store.keyPath)) return store.keyPath.map((key) => value?.[key]);
  return value?.[store.keyPath];
};

const matchesQuery = (candidate, query) => {
  if (!query) return true;
  if (typeof query === 'object' && query && 'type' in query && query.type === 'only') {
    return JSON.stringify(candidate) === JSON.stringify(query.value);
  }
  return JSON.stringify(candidate) === JSON.stringify(query);
};

const createIndexApi = (store, indexName) => ({
  async openKeyCursor(query) {
    const indexPath = store.indices.get(indexName) || indexName;
    const entries = Array.from(store.records.entries()).filter(([, value]) => matchesQuery(value?.[indexPath], query));
    return createCursor(entries);
  },
});

const createObjectStoreApi = (store) => ({
  createIndex(indexName, keyPath) {
    store.indices.set(indexName, keyPath);
    return createIndexApi(store, indexName);
  },
  index(indexName) {
    return createIndexApi(store, indexName);
  },
  async get(key) {
    const found = store.records.get(makeKey(key));
    return found === undefined ? undefined : cloneValue(found);
  },
  async getAll() {
    return Array.from(store.records.values()).map(cloneValue);
  },
  async put(value, key) {
    const resolvedKey = resolveKey(store, value, key);
    store.records.set(makeKey(resolvedKey), cloneValue(value));
    return resolvedKey;
  },
  async delete(key) {
    store.records.delete(makeKey(key));
  },
  async clear() {
    store.records.clear();
  },
});

const createTransactionApi = (dbEntry, storeNames) => {
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];
  const api = {
    done: Promise.resolve(),
    objectStore(name) {
      return createObjectStoreApi(ensureStore(dbEntry, String(name)));
    },
  };
  if (names.length === 1) {
    api.store = api.objectStore(names[0]);
  }
  return api;
};

const createDbApi = (dbEntry) => ({
  createObjectStore(name, options = {}) {
    const store = ensureStore(dbEntry, String(name));
    store.keyPath = options.keyPath || store.keyPath || 'id';
    return createObjectStoreApi(store);
  },
  transaction(storeNames) {
    return createTransactionApi(dbEntry, storeNames);
  },
  async get(storeName, key) {
    return createObjectStoreApi(ensureStore(dbEntry, String(storeName))).get(key);
  },
  async put(storeName, value, key) {
    return createObjectStoreApi(ensureStore(dbEntry, String(storeName))).put(value, key);
  },
  async getAll(storeName) {
    return createObjectStoreApi(ensureStore(dbEntry, String(storeName))).getAll();
  },
  async getAllFromIndex(storeName, indexName, query) {
    const store = ensureStore(dbEntry, String(storeName));
    const indexPath = store.indices.get(String(indexName)) || String(indexName);
    return Array.from(store.records.values()).filter((value) => matchesQuery(value?.[indexPath], query)).map(cloneValue);
  },
});

export async function openDB(name, version, { upgrade } = {}) {
  let dbEntry = previewDbs.get(name);
  const needsUpgrade = !dbEntry || (version ?? 1) > dbEntry.version;
  if (!dbEntry) {
    dbEntry = { version: version ?? 1, stores: new Map() };
    previewDbs.set(name, dbEntry);
  }
  if (needsUpgrade) {
    dbEntry.version = version ?? 1;
    if (upgrade) {
      await upgrade(createDbApi(dbEntry), 0, dbEntry.version, createTransactionApi(dbEntry, []));
    }
  }
  return createDbApi(dbEntry);
}

export async function deleteDB(name) {
  previewDbs.delete(name);
}

export const unwrap = (value) => value;
export const wrap = (value) => value;`;

        const previewBootstrapScript = `(() => {
  const createStorage = () => {
    const store = new Map();
    return {
      get length() { return store.size; },
      clear() { store.clear(); },
      getItem(key) { return store.has(String(key)) ? store.get(String(key)) : null; },
      key(index) { return Array.from(store.keys())[index] ?? null; },
      removeItem(key) { store.delete(String(key)); },
      setItem(key, value) { store.set(String(key), String(value)); },
    };
  };

  const installStorageShim = (name) => {
    try {
      void window[name];
      return;
    } catch {
      const storage = createStorage();
      try {
        Object.defineProperty(window, name, {
          configurable: true,
          enumerable: true,
          value: storage,
        });
      } catch {
        try {
          window[name] = storage;
        } catch {
          // ignore
        }
      }
    }
  };

  installStorageShim('localStorage');
  installStorageShim('sessionStorage');

  if (!window.IDBKeyRange) {
    window.IDBKeyRange = {
      only(value) {
        return { type: 'only', value };
      },
    };
  }

  const createRequest = () => ({
    result: undefined,
    error: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
  });

  const createIdbStore = (items, keyPath = 'id') => ({
    put(value) {
      const request = createRequest();
      queueMicrotask(() => {
        const key = value && keyPath ? value[keyPath] : undefined;
        items.set(key, value);
        request.result = key;
        request.onsuccess && request.onsuccess({ target: request });
      });
      return request;
    },
    getAll() {
      const request = createRequest();
      queueMicrotask(() => {
        request.result = Array.from(items.values());
        request.onsuccess && request.onsuccess({ target: request });
      });
      return request;
    },
    delete(key) {
      const request = createRequest();
      queueMicrotask(() => {
        items.delete(key);
        request.result = undefined;
        request.onsuccess && request.onsuccess({ target: request });
      });
      return request;
    },
    clear() {
      const request = createRequest();
      queueMicrotask(() => {
        items.clear();
        request.result = undefined;
        request.onsuccess && request.onsuccess({ target: request });
      });
      return request;
    },
  });

  const installIndexedDbShim = () => {
    try {
      const probe = window.indexedDB;
      if (probe) {
        try {
          probe.open('__preview_probe__');
          return;
        } catch {
          // fall through to shim
        }
      }
    } catch {
      // fall through to shim
    }

    const databases = new Map();
    const indexedDbShim = {
      open(name, version = 1) {
        const request = createRequest();
        queueMicrotask(() => {
          let entry = databases.get(name);
          const isNew = !entry;
          if (!entry) {
            entry = {
              version,
              stores: new Map(),
            };
            databases.set(name, entry);
          }

          const objectStoreNames = {
            contains(storeName) {
              return entry.stores.has(String(storeName));
            },
          };

          const db = {
            createObjectStore(storeName, options = {}) {
              const keyPath = options.keyPath || 'id';
              if (!entry.stores.has(String(storeName))) {
                entry.stores.set(String(storeName), { keyPath, items: new Map() });
              }
              return createIdbStore(entry.stores.get(String(storeName)).items, keyPath);
            },
            transaction(storeNames) {
              const names = Array.isArray(storeNames) ? storeNames.map(String) : [String(storeNames)];
              return {
                objectStore(storeName) {
                  const normalized = String(storeName);
                  if (!entry.stores.has(normalized)) {
                    entry.stores.set(normalized, { keyPath: 'id', items: new Map() });
                  }
                  const store = entry.stores.get(normalized);
                  return createIdbStore(store.items, store.keyPath);
                },
              };
            },
            close() {},
            get objectStoreNames() {
              return objectStoreNames;
            },
          };

          request.result = db;
          if (isNew || version > entry.version) {
            entry.version = version;
            request.onupgradeneeded && request.onupgradeneeded({ target: request });
          }
          request.onsuccess && request.onsuccess({ target: request });
        });
        return request;
      },
    };

    try {
      Object.defineProperty(window, 'indexedDB', {
        configurable: true,
        enumerable: true,
        value: indexedDbShim,
      });
    } catch {
      try {
        window.indexedDB = indexedDbShim;
      } catch {
        // ignore
      }
    }
  };

  installIndexedDbShim();
})();`;

        const encodeDataUrlComponent = (value: string) => {
          return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
        };

        const toDataUrl = (source: string, mimeType: string) => {
          return `data:${mimeType};charset=utf-8,${encodeDataUrlComponent(source)}`;
        };

        const blobToDataUrl = async (blob: Blob, mimeType?: string): Promise<string> => {
          const effectiveBlob = mimeType && blob.type !== mimeType ? blob.slice(0, blob.size, mimeType) : blob;
          return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error || new Error('Failed reading blob'));
            reader.readAsDataURL(effectiveBlob);
          });
        };

        const detectLoader = (modulePath: string): 'js' | 'jsx' | 'ts' | 'tsx' => {
          const lower = modulePath.toLowerCase();
          if (lower.endsWith('.tsx')) return 'tsx';
          if (lower.endsWith('.ts')) return 'ts';
          if (lower.endsWith('.jsx')) return 'jsx';
          return 'js';
        };

        const getTypescriptModule = async (): Promise<any> => {
          if (!typescriptModulePromise) {
            typescriptModulePromise = (async () => {
              try {
                return await import('typescript');
              } catch {
                try {
                  return await importRuntimeModule('https://esm.sh/typescript@6.0.2');
                } catch {
                  return null;
                }
              }
            })();
          }
          return typescriptModulePromise;
        };

        const transformModuleSource = async (code: string, modulePath: string): Promise<string> => {
          const loader = detectLoader(modulePath);
          if (loader === 'js') return code;

          try {
            const ts = await getTypescriptModule();
            if (!ts) throw new Error('TypeScript module not available');
            const transformed = ts.transpileModule(code, {
              compilerOptions: {
                target: ts.ScriptTarget.ES2022,
                module: ts.ModuleKind.ES2022,
                jsx: ts.JsxEmit.ReactJSX,
              },
              fileName: modulePath,
              reportDiagnostics: false,
              transformers: undefined,
            });

            if (!transformed.outputText) {
              throw new Error('No transpiled output generated');
            }

            return transformed.outputText;
          } catch (error: any) {
            warnings.push(`Failed to transform ${modulePath}: ${error?.message || 'unknown error'}`);
            // Fallback: try Sucrase from a CDN (lighter-weight browser transpile)
            try {
              if (!sucraseModulePromise) {
                sucraseModulePromise = importRuntimeModule('https://esm.sh/sucrase@3.33.0');
              }
              const sucrase = await sucraseModulePromise;
              const transformFn = (sucrase && (sucrase.transform || sucrase.default?.transform)) as any;
              if (typeof transformFn === 'function') {
                const res = transformFn(code, { transforms: ['typescript', 'jsx'], filePath: modulePath });
                if (res && res.code) return res.code;
              } else {
                warnings.push(`Sucrase fallback not available for ${modulePath}`);
              }
            } catch (sErr: any) {
              warnings.push(`Sucrase fallback failed: ${sErr?.message || sErr}`);
            }
            return code;
          }
        };

        const normalizeInlineModuleCode = (code: string): string => {
          return code.replace(/<\/(script)/gi, '<\\/$1');
        };

        const getInlineScriptContent = async (path: string, content: string, transform: boolean): Promise<string> => {
          let source = content;
          if (transform) {
            source = await transformModuleSource(content, path);
          }
          return `${normalizeInlineModuleCode(source)}\n//# sourceURL=${path}`;
        };

        const shouldInlineAsClassicScript = (path: string): boolean => {
          const lower = path.toLowerCase();
          return lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs');
        };

        const getCachedFileContent = async (path: string): Promise<string | null> => {
          if (sourceCache.has(path)) return sourceCache.get(path) ?? null;
          const content = await getSessionFileContent(currentSessionId, path);
          sourceCache.set(path, content);
          return content;
        };

        const getCachedFileBlob = async (path: string): Promise<Blob | null> => {
          if (blobCache.has(path)) return blobCache.get(path) ?? null;
          const blob = await getSessionFileBlob(currentSessionId, path);
          blobCache.set(path, blob);
          return blob;
        };

        const getAvailableSessionPaths = async (): Promise<string[]> => {
          if (!availableSessionPathsPromise) {
            availableSessionPathsPromise = getSessionFileMetas(currentSessionId).then((metas) => metas.map((meta) => meta.path));
          }
          return availableSessionPathsPromise;
        };

        const resolveLocalFile = async (basePath: string, refPath: string): Promise<{ path: string; content: string } | null> => {
          if (!isLocalPathReference(refPath)) return null;
          const candidates = buildLocalPathCandidates(basePath, refPath);
          for (const candidate of candidates) {
            const content = await getCachedFileContent(candidate);
            if (content != null) return { path: candidate, content };
          }

          const cleanRef = stripQueryAndHash(refPath).trim().replace(/^\/+/, '');
          if (cleanRef && refPath.trim().startsWith('/')) {
            const availablePaths = await getAvailableSessionPaths();
            const fallbackMatches = availablePaths.filter((path) => path === cleanRef || path.endsWith(`/${cleanRef}`));
            const prioritizedMatches = fallbackMatches.sort((left, right) => left.length - right.length);
            for (const fallbackPath of prioritizedMatches) {
              const content = await getCachedFileContent(fallbackPath);
              if (content != null) return { path: fallbackPath, content };
            }
          }

          return null;
        };

        async function rewriteModuleImports(code: string, modulePath: string): Promise<string> {
          const rewriteSpecifier = async (specifier: string): Promise<string | null> => {
            if (!isLocalPathReference(specifier)) {
              return specifier;
            }

            const isRelativeOrRoot = specifier.startsWith('.') || specifier.startsWith('/');
            if (!isRelativeOrRoot) {
              if (specifier === 'idb') {
                return toDataUrl(previewIdbModuleSource, 'text/javascript');
              }
              return mapBareImportToCdn(specifier);
            }

            const resolved = await resolveLocalFile(modulePath, specifier);
            if (!resolved) {
              warnings.push(`Could not resolve module import: ${specifier}`);
              return specifier;
            }

            const childUrl = await buildModuleUrl(resolved.path, resolved.content);
            return childUrl || specifier;
          };

          const rewriteMatches = async (input: string, pattern: RegExp, getReplacement: (match: RegExpExecArray) => Promise<string>): Promise<string> => {
            let rebuilt = '';
            let lastIndex = 0;
            let match: RegExpExecArray | null;

            pattern.lastIndex = 0;
            while ((match = pattern.exec(input)) !== null) {
              rebuilt += input.slice(lastIndex, match.index);
              rebuilt += await getReplacement(match);
              lastIndex = pattern.lastIndex;
            }

            rebuilt += input.slice(lastIndex);
            return rebuilt;
          };

          let rewritten = code;

          rewritten = await rewriteMatches(
            rewritten,
            /(^|\n)(\s*import\s+)(["'])([^"']+)(\3\s*;?)/g,
            async (match) => {
              const [, lineStart, prefix, quote, specifier, suffix] = match;
              const nextSpecifier = await rewriteSpecifier(specifier);
              return `${lineStart}${prefix}${quote}${nextSpecifier}${suffix}`;
            },
          );

          rewritten = await rewriteMatches(
            rewritten,
            /(^|\n)(\s*(?:import|export)\s+[^\n"']*?\sfrom\s+)(["'])([^"']+)(\3)/g,
            async (match) => {
              const [, lineStart, prefix, quote, specifier, suffix] = match;
              const nextSpecifier = await rewriteSpecifier(specifier);
              return `${lineStart}${prefix}${quote}${nextSpecifier}${suffix}`;
            },
          );

          rewritten = await rewriteMatches(
            rewritten,
            /import\s*\(\s*(["'])([^"']+)(\1\s*\))/g,
            async (match) => {
              const [, quote, specifier, suffix] = match;
              const nextSpecifier = await rewriteSpecifier(specifier);
              return `import(${quote}${nextSpecifier}${suffix}`;
            },
          );

          return rewritten;
        }

        async function rewriteCssAssetUrls(css: string, cssPath: string): Promise<string> {
          const urlRegex = /url\(([^)]+)\)/g;
          let rebuilt = '';
          let lastIndex = 0;
          let match: RegExpExecArray | null;

          while ((match = urlRegex.exec(css)) !== null) {
            rebuilt += css.slice(lastIndex, match.index);

            const rawValue = match[1].trim();
            const quote = rawValue.startsWith('"') || rawValue.startsWith("'") ? rawValue[0] : '';
            const unquoted = quote ? rawValue.slice(1, -1) : rawValue;

            if (!isLocalPathReference(unquoted)) {
              rebuilt += match[0];
              lastIndex = urlRegex.lastIndex;
              continue;
            }

            const resolved = await resolveLocalFile(cssPath, unquoted);
            if (!resolved) {
              warnings.push(`Could not resolve CSS asset: ${unquoted}`);
              rebuilt += match[0];
              lastIndex = urlRegex.lastIndex;
              continue;
            }

            const blob = await getCachedFileBlob(resolved.path);
            if (!blob) {
              warnings.push(`Missing CSS asset blob in session: ${resolved.path}`);
              rebuilt += match[0];
              lastIndex = urlRegex.lastIndex;
              continue;
            }

            const dataUrl = await blobToDataUrl(blob, getMimeTypeForPath(resolved.path));
            rebuilt += `url(${quote}${dataUrl}${quote})`;
            lastIndex = urlRegex.lastIndex;
          }

          rebuilt += css.slice(lastIndex);
          return rebuilt;
        }

        async function buildStyleModuleUrl(modulePath: string, cssSource: string): Promise<string> {
          const rewrittenCss = await rewriteCssAssetUrls(cssSource, modulePath);
          const moduleSource = [
            `const css = ${JSON.stringify(rewrittenCss)};`,
            `const style = document.createElement('style');`,
            `style.setAttribute('data-preview-source', ${JSON.stringify(modulePath)});`,
            `style.textContent = css;`,
            `document.head.appendChild(style);`,
            `export default css;`,
          ].join('\n');
          return toDataUrl(moduleSource, 'text/javascript');
        }

        async function buildAssetModuleUrl(modulePath: string): Promise<string | null> {
          const blob = await getCachedFileBlob(modulePath);
          if (!blob) {
            warnings.push(`Missing asset blob in session: ${modulePath}`);
            return null;
          }

          const dataUrl = await blobToDataUrl(blob, getMimeTypeForPath(modulePath));
          const moduleSource = `const assetUrl = ${JSON.stringify(dataUrl)};\nexport default assetUrl;`;
          return toDataUrl(moduleSource, 'text/javascript');
        }

        async function buildModuleUrl(modulePath: string, providedSource?: string): Promise<string | null> {
          const cached = moduleUrlCache.get(modulePath);
          if (cached) return cached;

          if (styleModulePattern.test(modulePath)) {
            const cssSource = providedSource ?? await getCachedFileContent(modulePath);
            if (cssSource == null) {
              warnings.push(`Missing stylesheet source in session: ${modulePath}`);
              return null;
            }
            const styleUrl = await buildStyleModuleUrl(modulePath, cssSource);
            moduleUrlCache.set(modulePath, styleUrl);
            return styleUrl;
          }

          if (assetModulePattern.test(modulePath)) {
            const assetUrl = await buildAssetModuleUrl(modulePath);
            if (assetUrl) {
              moduleUrlCache.set(modulePath, assetUrl);
            }
            return assetUrl;
          }

          let source: string | null | undefined = providedSource;
          if (source == null) {
            source = await getCachedFileContent(modulePath);
          }
          if (source == null) {
            warnings.push(`Missing module source in session: ${modulePath}`);
            return null;
          }

          const transformed = await transformModuleSource(source, modulePath);
          const rewritten = await rewriteModuleImports(transformed, modulePath);

          try {
            const url = toDataUrl(rewritten, 'text/javascript');
            moduleUrlCache.set(modulePath, url);
            return url;
          } catch (e: any) {
            warnings.push(`Failed creating data URL for ${modulePath}: ${e?.message || e}`);
            try {
              console.error('Failed module content for', modulePath, rewritten.slice(0, 1024));
            } catch {}
            return null;
          }
        }

        const existingHead = doc.head || doc.getElementsByTagName('head')[0] || doc.documentElement?.insertBefore(doc.createElement('head'), doc.body || null) || null;
        if (existingHead) {
          const bootstrapScript = doc.createElement('script');
          bootstrapScript.textContent = previewBootstrapScript;
          existingHead.prepend(bootstrapScript);
        }

        const scriptNodes = Array.from(doc.querySelectorAll('script[src]'));
        for (const script of scriptNodes) {
          const src = script.getAttribute('src') || '';
          if (!isLocalPathReference(src)) continue;

          const resolved = await resolveLocalFile(selectedFile.path, src);
          if (!resolved) {
            warnings.push(`Could not resolve script source: ${src}`);
            script.remove();
            continue;
          }

          const scriptType = (script.getAttribute('type') || '').toLowerCase();
          if (scriptType === 'module') {
            const moduleUrl = await buildModuleUrl(resolved.path, resolved.content);
            if (!moduleUrl) {
              warnings.push(`Removed unresolved module script: ${src}`);
              script.remove();
              continue;
            }
            script.setAttribute('src', moduleUrl);
            script.setAttribute('type', 'module');
            continue;
          }

          script.removeAttribute('src');
          script.textContent = await getInlineScriptContent(resolved.path, resolved.content, !shouldInlineAsClassicScript(resolved.path));
        }

        const styleNodes = Array.from(doc.querySelectorAll('link[rel="stylesheet"][href]'));
        for (const link of styleNodes) {
          const href = link.getAttribute('href') || '';
          if (!isLocalPathReference(href)) continue;
          const resolved = await resolveLocalFile(selectedFile.path, href);
          if (!resolved) {
            warnings.push(`Could not resolve stylesheet source: ${href}`);
            continue;
          }
          const styleEl = doc.createElement('style');
          styleEl.textContent = `${resolved.content}\n/* source: ${resolved.path} */`;
          link.replaceWith(styleEl);
        }

        const linkedAssetNodes = Array.from(doc.querySelectorAll('link[href]'));
        for (const link of linkedAssetNodes) {
          if ((link.getAttribute('rel') || '').toLowerCase() === 'stylesheet') continue;

          const href = link.getAttribute('href') || '';
          if (!isLocalPathReference(href)) continue;

          const rel = (link.getAttribute('rel') || '').toLowerCase();
          if (rel === 'manifest' || rel.includes('icon')) {
            link.remove();
            continue;
          }

          const resolved = await resolveLocalFile(selectedFile.path, href);
          if (!resolved) {
            warnings.push(`Removed unresolved linked asset: ${href}`);
            link.remove();
            continue;
          }

          const isManifest = (link.getAttribute('rel') || '').toLowerCase() === 'manifest';
          if (isManifest) {
            const manifestUrl = toDataUrl(resolved.content, 'application/manifest+json');
            link.setAttribute('href', manifestUrl);
            continue;
          }

          const blob = await getCachedFileBlob(resolved.path);
          if (!blob) {
            warnings.push(`Removed unresolved linked asset blob: ${href}`);
            link.remove();
            continue;
          }

          const assetUrl = await blobToDataUrl(blob, getMimeTypeForPath(resolved.path));
          link.setAttribute('href', assetUrl);
        }

        const html = doc.documentElement ? `<!doctype html>\n${doc.documentElement.outerHTML}` : selectedFile.content;
        if (!cancelled) {
          setProcessedHtml(html);
          setPreviewWarnings(Array.from(new Set(warnings)));
        }
      } catch (error: any) {
        if (!cancelled) {
          setProcessedHtml(buildSanitizedFallbackHtml());
          setPreviewWarnings([
            `Preview processing failed: ${error?.message || 'unknown error'}`,
            'Local scripts and linked assets were removed from the fallback preview to avoid browser CORS failures.',
          ]);
        }
      }
    };

    void prepareHtmlPreview();

    return () => {
      cancelled = true;
    };
  }, [isHtml, selectedFile?.content, selectedFile?.path, currentSessionId]);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#020a08] relative">
      <div className="h-10 bg-[rgba(1,15,12,0.8)] border-b border-[var(--border)] flex items-center justify-between px-4 text-[0.65rem] font-mono text-[var(--accent)] uppercase tracking-tighter sticky top-0 z-10 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2">
            {isImage ? <ImageIcon className="w-3 h-3 text-[var(--accent)]" /> : isVideo ? <Video className="w-3 h-3 text-[var(--accent)]" /> : isHtml ? <Globe className="w-3 h-3 text-[var(--accent)]" /> : <FileText className="w-3 h-3 opacity-50" />}
            {selectedFile ? selectedFile.path : "Select a file to begin"}
          </span>
          {selectedFile && !isImage && !isVideo && (
            <button 
              onClick={() => onContextualize(`\nAnalyze this file: ${selectedFile.path}\n`)} 
              className="px-2 py-0.5 rounded border border-[var(--accent)]/40 hover:bg-[var(--accent)]/20 transition-all text-[var(--accent)] flex items-center gap-1 font-bold"
            >
              <Send className="w-2.5 h-2.5" /> Contextualize
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isHtml && (
            <div className="flex bg-black/40 rounded-md border border-[var(--border)] p-0.5 mr-2">
              <button 
                onClick={() => setViewMode('preview')} 
                className={cn("px-2 py-0.5 rounded text-[0.55rem] font-bold flex items-center gap-1 transition-all", viewMode === 'preview' ? "bg-[var(--accent)] text-black" : "text-[var(--text-muted)] hover:text-white")}
              >
                <Eye className="w-2.5 h-2.5" /> Preview
              </button>
              <button 
                onClick={() => setViewMode('source')} 
                className={cn("px-2 py-0.5 rounded text-[0.55rem] font-bold flex items-center gap-1 transition-all", viewMode === 'source' ? "bg-[var(--accent)] text-black" : "text-[var(--text-muted)] hover:text-white")}
              >
                <Code className="w-2.5 h-2.5" /> Source
              </button>
            </div>
          )}
          <span className="opacity-40">{selectedFile && selectedFile.content ? `${((selectedFile.content.length || 0) / 1024).toFixed(1)} KB` : selectedFile?.blob ? `${(selectedFile.blob.size / 1024).toFixed(1)} KB` : ""}</span>
          {selectedFile?.blob && (
            <a href={blobUrl || ''} download={selectedFile.name} className="p-1 hover:text-[var(--accent)] transition-colors" title="Download">
              <Download className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
        {!selectedFile ? (
          <div className="h-full flex flex-col items-center justify-center text-[var(--text-muted)] animate-pulse">
            <div className="w-24 h-24 rounded-full border border-[var(--accent)]/10 flex items-center justify-center mb-6 shadow-[0_0_50px_rgba(0,255,157,0.05)]">
              <Code2 className="w-10 h-10 opacity-20" />
            </div>
            <p className="text-[0.65rem] uppercase font-black tracking-[0.3em] opacity-30">Waiting for Data Forge...</p>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto h-full">
            {isImage && blobUrl && (
              <div className="flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-500">
                <div className="p-2 bg-black/40 border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden group relative">
                    <img src={blobUrl} alt={selectedFile.name} className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-inner" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                        <span className="text-[0.6rem] font-mono text-white/70">{selectedFile.name}</span>
                    </div>
                </div>
              </div>
            )}
            {isVideo && blobUrl && (
              <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                <video controls className="w-full max-h-[70vh] rounded-2xl border border-[var(--border)] shadow-2xl shadow-[var(--accent)]/5">
                  <source src={blobUrl} type={selectedFile.blob?.type} />
                </video>
              </div>
            )}
            {isPdf && blobUrl && (
              <iframe src={blobUrl} className="w-full h-[80vh] rounded-2xl border border-[var(--border)]" />
            )}
            {isHtml && viewMode === 'preview' && (
              <div className="w-full h-[80vh] bg-white rounded-2xl border border-[var(--border)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-500 flex flex-col">
                {previewWarnings.length > 0 && (
                  <div className="border-b border-yellow-600/30 bg-yellow-100 text-yellow-900 px-3 py-2 text-[0.7rem]">
                    <div className="flex items-center gap-2 font-semibold mb-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Preview warnings
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {previewWarnings.slice(0, 4).map((warning, index) => (
                        <li key={`${index}-${warning}`}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <iframe 
                  srcDoc={processedHtml || selectedFile.content || ''}
                    title={selectedFile.name} 
                    className="w-full h-full border-none"
                    sandbox="allow-scripts"
                />
              </div>
            )}
            {(!isImage && !isVideo && !isPdf && (!isHtml || viewMode === 'source')) && (
               <>
                {selectedFile.name.toLowerCase().endsWith('.md') || selectedFile.name.toLowerCase().endsWith('.mdx') ? (
                    <div className="prose prose-invert prose-emerald max-w-none prose-headings:text-[var(--accent)] prose-a:text-[var(--accent-hover)] animate-in fade-in slide-in-from-top-2 duration-500">
                      <Markdown>{selectedFile.content || ""}</Markdown>
                    </div>
                  ) : (
                    <div className="relative group animate-in fade-in slide-in-from-bottom-2 duration-500">
                      <pre className="p-6 md:p-10 bg-[#010806] rounded-2xl border border-[var(--border)] overflow-x-auto text-[0.75rem] font-mono leading-relaxed shadow-2xl relative">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[var(--accent)]/20 to-transparent" />
                        <code className="text-[#96f2d7] block min-w-full">{selectedFile.content || ""}</code>
                      </pre>
                      <button 
                        onClick={() => navigator.clipboard.writeText(selectedFile.content || "")} 
                        className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)] hover:text-black border border-[var(--accent)] rounded-lg px-3 py-1.5 text-[0.7rem] font-bold uppercase shadow-lg backdrop-blur-sm"
                      >
                        Copy Code
                      </button>
                    </div>
                  )}
               </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
