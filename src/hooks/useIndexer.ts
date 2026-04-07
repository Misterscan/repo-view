import { useState, useEffect } from 'react';
import { ChunkDoc, ExtendedFile, FileNode } from '../types';
import { CONFIG, IGNORED_DIRS, IGNORED_EXTS } from '../lib/constants';
import { ai, chunkText, getMimeType, uploadFileToGemini, exponentialBackoff } from '../lib/gemini';
import { 
  getSessions, 
  getSessionFiles, 
  getSessionFileContent, 
  getSessionEmbeddings, 
  createSession, 
  saveSessionFiles, 
  saveSessionEmbeddings, 
  updateSessionUris, 
  RepoSession,
} from '../lib/db';

function isIgnored(file: ExtendedFile) {
  const path = file.webkitRelativePath || file.name;
  const lowerName = file.name.toLowerCase();
  if (IGNORED_EXTS.some(ext => lowerName.endsWith(ext))) return true;
  const pathParts = path.split('/');
  if (pathParts.some(part => IGNORED_DIRS.includes(part))) return true;
  return false;
}

export function useIndexer() {
  const [sessions, setSessions] = useState<RepoSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
  const [files, setFiles] = useState<FileNode[]>([]);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState(0);
  const [indexState, setIndexState] = useState<string>('Ready');
  const [db, setDb] = useState<ChunkDoc[]>([]);
  const [uploadedUris, setUploadedUris] = useState<{ uri: string, name: string, mimeType: string, size?: number }[]>([]);

  // DB Load Sessions on Mount
  useEffect(() => {
    (async () => {
      try {
        const storedSessions = await getSessions();
        setSessions(storedSessions);
        // Try load last session if exists
        if (storedSessions.length > 0) {
          const last = storedSessions[storedSessions.length - 1];
          await loadSession(last.id);
        }
      } catch (e) {
        console.error("DB Load Error", e);
      }
    })();
  }, []);

  const loadSession = async (id: string) => {
    setCurrentSessionId(id);
    const sFiles = await getSessionFiles(id);
    const sDb = await getSessionEmbeddings(id);
    const s = (await getSessions()).find(x => x.id === id);
    
    setFiles(sFiles);
    setDb(sDb);
    setUploadedUris(s?.uploadedUris || []);
    setIndexState(sDb.length > 0 ? `Ready (${sDb.length} chunks)` : 'Not Indexed');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploaded = Array.from(e.target.files || []) as ExtendedFile[];
    const valid = uploaded.filter(f => !isIgnored(f));
    if (valid.length === 0) return;

    // Create a new session for this upload
    const name = valid[0].webkitRelativePath?.split('/')[0] || "Upload-" + Date.now();
    const session = await createSession(name);
    setCurrentSessionId(session.id);
    setSessions(prev => [...prev, session]);

    // Lazy load: we don't call file.text() here anymore! 
    const fileRecords = valid.map(file => ({
      path: file.webkitRelativePath || file.name,
      name: file.name,
      type: file.type,
      blob: file, // Store the File directly! (extends Blob)
      isIndexed: false
    }));
    
    await saveSessionFiles(session.id, fileRecords);
    
    setFiles(fileRecords.map(f => ({ name: f.name, path: f.path, type: f.type, isIndexed: f.isIndexed })));
    setIndexState('Not Indexed');
    setDb([]);
    setUploadedUris([]);
  };

  const startIndexing = async (onComplete: (uris: { uri: string, name: string, mimeType: string, size?: number }[], dbItems: ChunkDoc[]) => void, onError: (err: any) => void) => {
    if (!currentSessionId || files.length === 0) return;
    setIsIndexing(true);
    setIndexProgress(0);
    setIndexState('Indexing...');

    const newDb: ChunkDoc[] = [];
    const newUris: { uri: string, name: string, mimeType: string, size?: number }[] = [];
    const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';

    try {
      for (let i = 0; i < files.length; i++) {
        const fNode = files[i];
        const mime = getMimeType(fNode.name);
        let blobText = "";
        
        try {
          const contentStr = await getSessionFileContent(currentSessionId, fNode.path);
          if (contentStr) blobText = contentStr;
        } catch(e) { }

        // Mime check if valid for embedding
        const isEmbeddable = (mime.startsWith('text/') || mime === 'application/json') && blobText.length < CONFIG.maxEmbeddingBytes;
        const isMedia = mime.startsWith('image/') || mime.startsWith('video/');

        // 1. Upload to Files API (Text only)
        if (blobText && !isMedia) {
          try {
            // Reconstruct a File for Gemini Upload
            const fileBlob = new File([blobText], fNode.name, { type: mime });
            const uri = await uploadFileToGemini(fileBlob, apiKey, mime);
            newUris.push({ uri, name: fNode.name, mimeType: mime, size: blobText.length });
            await updateSessionUris(currentSessionId, newUris);
          } catch (e) { console.warn("Files API error", e); }
        }

        // 2. RAG Chunking
        if (isEmbeddable && blobText) {
          const chunks = chunkText(blobText, CONFIG.chunkSize, fNode.name);
          for (const chunk of chunks) {
            const res = await exponentialBackoff(() => ai.models.embedContent({
              model: CONFIG.embedModel,
              contents: [chunk]
            }));
            const vec = res.embeddings?.[0]?.values || [];
            newDb.push({ text: chunk, vec, file: fNode.path });
          }
        } else if (isMedia) {
          // Index Media Metadata for Search
          const mediaRef = `[MEDIA_CONTENT]: ${fNode.name} in path ${fNode.path}`;
          const res = await exponentialBackoff(() => ai.models.embedContent({
            model: CONFIG.embedModel,
            contents: [mediaRef]
          }));
          const vec = res.embeddings?.[0]?.values || [];
          newDb.push({ text: mediaRef, vec, file: fNode.path, isMedia: true, mimeType: mime });
        }
        setIndexProgress(Math.round(((i + 1) / files.length) * 100));
      }

      await saveSessionEmbeddings(currentSessionId, newDb);
      
      setDb(newDb);
      setUploadedUris(newUris);
      setIndexState(`Ready (${newDb.length} chunks)`);
      onComplete(newUris, newDb);
    } catch (e: any) {
      setIndexState('Failed');
      onError(e);
    } finally {
      setIsIndexing(false);
    }
  };

  return {
    sessions,
    currentSessionId,
    loadSession,
    files,
    setFiles,
    isIndexing,
    indexProgress,
    indexState,
    db,
    uploadedUris,
    handleFileUpload,
    startIndexing,
  };
}
