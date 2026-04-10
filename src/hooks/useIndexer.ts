import { useEffect } from 'react';
import JSZip from 'jszip';
import { ChunkDoc, ExtendedFile } from '../types';
import { CONFIG, IGNORED_DIRS, IGNORED_EXTS } from '../lib/constants';
import { chunkText, embedTexts, getMimeType, uploadFileToGemini, exponentialBackoff } from '../lib/gemini';
import { readApiResult } from '../lib/api';
import { 
  getSessions, 
  getSession,
  getSessionFiles, 
  getSessionFileContent, 
  getSessionFileBlob,
  getSessionEmbeddings, 
  createSession, 
  deleteSession,
  saveSessionFiles, 
  saveSessionEmbeddings, 
  updateSessionUris,
  updateSessionServerUploadId,
} from '../lib/db';
import { useIndexerState } from '../store/appState';

function isIgnored(file: ExtendedFile) {
  const path = file.webkitRelativePath || file.name;
  const lowerName = file.name.toLowerCase();
  if (IGNORED_EXTS.some(ext => lowerName.endsWith(ext))) return true;
  const pathParts = path.split('/');
  if (pathParts.some(part => IGNORED_DIRS.includes(part))) return true;
  return false;
}

export function useIndexer() {
  const {
    sessions,
    setSessions,
    currentSessionId,
    setCurrentSessionId,
    files,
    setFiles,
    isIndexing,
    setIsIndexing,
    indexProgress,
    setIndexProgress,
    indexState,
    setIndexState,
    db,
    setDb,
    uploadedUris,
    setUploadedUris,
  } = useIndexerState();

  const resetState = () => {
    setCurrentSessionId(null);
    setFiles([]);
    setDb([]);
    setUploadedUris([]);
    setIndexState('Ready');
  };

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

  const deleteSessionById = async (id: string) => {
    const session = await getSession(id);
    const serverUploadSessionId = session?.serverUploadSessionId;

    if (serverUploadSessionId) {
      try {
        await fetch(`/api/repo/upload-session/${encodeURIComponent(serverUploadSessionId)}`, {
          method: 'DELETE',
        });
      } catch (error) {
        console.warn('Server upload cleanup failed', error);
      }
    }

    await deleteSession(id);
    const remaining = await getSessions();
    setSessions(remaining);

    if (currentSessionId !== id) return;

    if (remaining.length > 0) {
      const fallback = remaining[remaining.length - 1];
      await loadSession(fallback.id);
      return;
    }

    setCurrentSessionId(null);
    setFiles([]);
    setDb([]);
    setUploadedUris([]);
    setIndexState('Ready');
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

  const handleReupload = async (sessionId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const uploaded = Array.from(e.target.files || []) as ExtendedFile[];
    const valid = uploaded.filter(f => !isIgnored(f));
    if (valid.length === 0) return;

    // Do not create a new session; update existing session files
    const fileRecords = valid.map(file => ({
      path: file.webkitRelativePath || file.name,
      name: file.name,
      type: file.type,
      blob: file,
      isIndexed: false,
    }));

    await saveSessionFiles(sessionId, fileRecords);

    // Refresh session view
    await loadSession(sessionId);
  };

  const uploadFiles = async (sessionId: string, filesToUpload: { path: string; name: string; type: string; blob: Blob }[]) => {
    if (!sessionId || filesToUpload.length === 0) return;
    const fileRecords = filesToUpload.map(f => ({ path: f.path, name: f.name, type: f.type, blob: f.blob, isIndexed: false }));
    await saveSessionFiles(sessionId, fileRecords);
    await loadSession(sessionId);
  };

  const createSessionFromImportedFiles = async (sessionName: string, filesToUpload: { path: string; name: string; type: string; blob: Blob }[]) => {
    const session = await createSession(sessionName || `Import-${Date.now()}`);
    setCurrentSessionId(session.id);
    setSessions(prev => [...prev, session]);
    await uploadFiles(session.id, filesToUpload);
    setIndexState('Not Indexed');
    setDb([]);
    setUploadedUris([]);
    return session.id;
  };

  const startIndexing = async (onComplete: (uris: { uri: string, name: string, mimeType: string, size?: number }[], dbItems: ChunkDoc[]) => void, onError: (err: any) => void) => {
    if (!currentSessionId || files.length === 0) return;
    setIsIndexing(true);
    setIndexProgress(0);
    setIndexState('Indexing...');

    const newDb: ChunkDoc[] = [];
    const newUris: { uri: string, name: string, mimeType: string, size?: number }[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const fNode = files[i];
        const mime = getMimeType(fNode.name);
        let blobText = "";
        
        try {
          const contentStr = await getSessionFileContent(currentSessionId, fNode.path);
          if (contentStr) blobText = contentStr;
        } catch {}

        // Mime check if valid for embedding
        const geminiMime = mime === 'image/svg+xml' ? 'text/plain' : mime;
        const isEmbeddable = (geminiMime.startsWith('text/') || geminiMime === 'application/json') && blobText.length < CONFIG.maxEmbeddingBytes;
        const isMedia = geminiMime.startsWith('image/');

        // 1. Upload to Files API (Text only) - Only if not already uploaded
        const alreadyUploaded = uploadedUris.find(u => u.name === fNode.name && u.size === blobText.length);
        if (blobText && !isMedia && !alreadyUploaded) {
          try {
            // Reconstruct a File for Gemini Upload
            const fileBlob = new File([blobText], fNode.name, { type: geminiMime });
            const uri = await uploadFileToGemini(fileBlob, geminiMime);
            newUris.push({ uri, name: fNode.name, mimeType: geminiMime, size: blobText.length });
            await updateSessionUris(currentSessionId, [...uploadedUris, ...newUris]);
          } catch (e) { console.warn("Files API error", e); }
        } else if (alreadyUploaded) {
          newUris.push(alreadyUploaded);
        }

        // 2. RAG Chunking
        if (isEmbeddable && blobText) {
          const chunks = chunkText(blobText, CONFIG.chunkSize, fNode.name);
          for (const chunk of chunks) {
            const [vec = []] = await exponentialBackoff(() => embedTexts(CONFIG.embedModel, [chunk]));
            newDb.push({ text: chunk, vec, file: fNode.path });
          }
        } else if (isMedia) {
          // Index Media Metadata for Search
          const mediaRef = `[MEDIA_CONTENT]: ${fNode.name} in path ${fNode.path}`;
          const [vec = []] = await exponentialBackoff(() => embedTexts(CONFIG.embedModel, [mediaRef]));
          newDb.push({ text: mediaRef, vec, file: fNode.path, isMedia: true, mimeType: mime });
        }
        setIndexProgress(Math.round(((i + 1) / files.length) * 100));
      }

      await saveSessionEmbeddings(currentSessionId, newDb);

      // --- SERVER SYNC START ---
      // After successful indexing, ensure the server has these files in server_uploads
      try {
        const zip = new JSZip();
        for (const node of files) {
          const content = await getSessionFileContent(currentSessionId, node.path);
          if (content) {
            zip.file(node.path, content);
          } else {
            // fallback to blob if content not in text store
            const blob = await getSessionFileBlob(currentSessionId, node.path);
            if (blob) zip.file(node.path, blob);
          }
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const form = new FormData();
        const sessionName = sessions.find(s => s.id === currentSessionId)?.name || 'index-sync';
        form.append('file', zipBlob, `${sessionName}.zip`);
        
        const resp = await fetch('/api/repo/upload', { method: 'POST', body: form });
        const data = await readApiResult<{ sessionId?: string }>(resp, 'Server sync failed during indexing');
        if (data.sessionId) {
          await updateSessionServerUploadId(currentSessionId, data.sessionId);
        }
      } catch (syncErr) {
        console.warn("Failed to sync indexed files to server disk:", syncErr);
      }
      // --- SERVER SYNC END ---

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
    deleteSessionById,
    handleFileUpload,
    handleReupload,
    uploadFiles,
    createSessionFromImportedFiles,
    startIndexing,
    resetState,
    updateSessionServerUploadId
  };
}
