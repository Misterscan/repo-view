import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { ChunkDoc, FileNode, Message } from '../types';

export interface RepoSession {
  id: string;
  name: string;
  timestamp: number;
  uploadedUris: { uri: string, name: string, mimeType: string, size?: number }[];
  chunksCount: number;
  serverUploadSessionId?: string;
}

interface RepoDocDB extends DBSchema {
  repositories: {
    key: string;
    value: RepoSession;
  };
  files: {
    key: [string, string];
    value: {
      sessionId: string;
      path: string;
      name: string;
      type: string;
      blob: Blob;
      hash?: string;
      isIndexed: boolean;
    };
    indexes: { 'by-session': string };
  };
  embeddings: {
    key: number;
    value: ChunkDoc & { sessionId: string };
    indexes: { 'by-session': string };
  };
  chats: {
    key: string;
    value: {
      sessionId: string;
      messages: Message[];
    };
  };
}

let dbPromise: Promise<IDBPDatabase<RepoDocDB>> | null = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<RepoDocDB>('repodoc-db-v2', 1, {
      upgrade(db) {
        db.createObjectStore('repositories', { keyPath: 'id' });
        const fileStore = db.createObjectStore('files', { keyPath: ['sessionId', 'path'] });
        fileStore.createIndex('by-session', 'sessionId');
        const embeddingStore = db.createObjectStore('embeddings', { keyPath: 'id', autoIncrement: true });
        embeddingStore.createIndex('by-session', 'sessionId');
        db.createObjectStore('chats', { keyPath: 'sessionId' });
      },
    });
  }
  return dbPromise;
}

export async function createSession(name: string): Promise<RepoSession> {
  const db = await getDB();
  const id = Date.now().toString();
  const session: RepoSession = {
    id,
    name,
    timestamp: Date.now(),
    uploadedUris: [],
    chunksCount: 0,
  };
  await db.put('repositories', session);
  return session;
}

export async function getSessions(): Promise<RepoSession[]> {
  const db = await getDB();
  return await db.getAll('repositories');
}

export async function getSession(id: string): Promise<RepoSession | undefined> {
  const db = await getDB();
  return await db.get('repositories', id);
}

export async function deleteSession(id: string) {
  const db = await getDB();
  const tx = db.transaction(['repositories', 'files', 'embeddings', 'chats'], 'readwrite');
  
  const fileStore = tx.objectStore('files');
  let fileCursor = await fileStore.index('by-session').openKeyCursor(IDBKeyRange.only(id));
  while (fileCursor) {
    await fileStore.delete(fileCursor.primaryKey);
    fileCursor = await fileCursor.continue();
  }

  const embStore = tx.objectStore('embeddings');
  let embCursor = await embStore.index('by-session').openKeyCursor(IDBKeyRange.only(id));
  while (embCursor) {
    await embStore.delete(embCursor.primaryKey);
    embCursor = await embCursor.continue();
  }

  await tx.objectStore('repositories').delete(id);
  await tx.objectStore('chats').delete(id);
  await tx.done;
}

export async function saveSessionFiles(sessionId: string, files: { path: string; name: string; type: string; blob: Blob; isIndexed: boolean }[]) {
  const db = await getDB();
  for (const f of files) {
    // Compute hash FIRST, taking time outside any IDB transaction
    let hash: string | undefined = undefined;
    try {
      const buf = await f.blob.arrayBuffer();
      const hashBuf = await crypto.subtle.digest('SHA-256', buf);
      hash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // ignore hash errors
    }

    // Now open a fresh transaction per file so it doesn't timeout
    const tx = db.transaction('files', 'readwrite');
    try {
      const key = [sessionId, f.path] as [string, string];
      const existing = await tx.store.get(key as any);

      const isIndexed = Boolean(existing?.isIndexed && existing?.hash && hash && existing.hash === hash);
      await tx.store.put({ ...f, sessionId, hash, isIndexed });
    } catch {
      await tx.store.put({ ...f, sessionId });
    }
    await tx.done;
  }
}

export async function getSessionFiles(sessionId: string): Promise<FileNode[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('files', 'by-session', sessionId);
  return all.map(f => ({
    path: f.path,
    name: f.name,
    type: f.type,
    isIndexed: f.isIndexed,
    // expose hash if present for client-side comparisons
    hash: (f as any).hash || undefined,
  } as FileNode));
}

export async function getSessionFileMetas(sessionId: string): Promise<{ path: string; name: string; type: string; hash?: string }[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex('files', 'by-session', sessionId);
  return all.map(f => ({ path: f.path, name: f.name, type: f.type, hash: (f as any).hash }));
}

export async function getSessionFileContent(sessionId: string, path: string): Promise<string | null> {
  const db = await getDB();
  const f = await db.get('files', [sessionId, path]);
  if (!f || !f.blob) return null;
  return await f.blob.text();
}

export async function getSessionFileBlob(sessionId: string, path: string): Promise<Blob | null> {
  const db = await getDB();
  const f = await db.get('files', [sessionId, path]);
  return f?.blob || null;
}

export async function saveSessionEmbeddings(sessionId: string, embeddings: ChunkDoc[]) {
  const db = await getDB();
  const tx = db.transaction(['embeddings', 'repositories'], 'readwrite');
  const store = tx.objectStore('embeddings');
  
  let cursor = await store.index('by-session').openKeyCursor(IDBKeyRange.only(sessionId));
  while (cursor) {
    await store.delete(cursor.primaryKey);
    cursor = await cursor.continue();
  }

  for (const emb of embeddings) {
    await store.put({ ...emb, sessionId });
  }

  const session = await tx.objectStore('repositories').get(sessionId);
  if (session) {
    session.chunksCount = embeddings.length;
    await tx.objectStore('repositories').put(session);
  }

  await tx.done;
}

export async function getSessionEmbeddings(sessionId: string): Promise<ChunkDoc[]> {
  const db = await getDB();
  return await db.getAllFromIndex('embeddings', 'by-session', sessionId);
}

export async function updateSessionUris(sessionId: string, uris: { uri: string, name: string, mimeType: string }[]) {
  const db = await getDB();
  const session = await db.get('repositories', sessionId);
  if (session) {
    session.uploadedUris = uris;
    await db.put('repositories', session);
  }
}

export async function updateSessionServerUploadId(sessionId: string, serverUploadSessionId: string) {
  const db = await getDB();
  const session = await db.get('repositories', sessionId);
  if (session) {
    session.serverUploadSessionId = serverUploadSessionId;
    await db.put('repositories', session);
  }
}

export async function saveChatHistory(sessionId: string, messages: Message[]) {
  const db = await getDB();
  await db.put('chats', { sessionId, messages });
}

export async function getChatHistory(sessionId: string): Promise<Message[]> {
  const db = await getDB();
  const sessionChat = await db.get('chats', sessionId);
  return sessionChat ? sessionChat.messages : [];
}
