import { useState, useRef, useEffect } from 'react';
import { Message, ChunkDoc } from '../types';
import { ai, cosineSimilarity, estimateTokens } from '../lib/gemini';
import { CONFIG } from '../lib/constants';
import { ThinkingLevel } from '@google/genai';
import { saveChatHistory, getChatHistory } from '../lib/db';

export function useAgent(
  db: ChunkDoc[], 
  uploadedUris: { uri: string, name: string, mimeType: string, size?: number }[],
  currentSessionId: string | null
) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', text: "**Welcome to your coding agent.**\n\n- Load your project files.\n- Click **Index & Upload** to prepare the context.\n- Chat with your codebase using RAG and Live Grounding." }
  ]);
  const [query, setQuery] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [selectedModel, setSelectedModel] = useState("gemini-3.1-pro-preview");
  const [useGrounding, setUseGrounding] = useState(true);

  // Load chat history when sessionId changes
  useEffect(() => {
    (async () => {
      if (currentSessionId) {
        const history = await getChatHistory(currentSessionId);
        if (history && history.length > 0) {
          setMessages(history);
        } else {
          setMessages([{ role: 'ai', text: `**Welcome.** Switched to session: ${currentSessionId.slice(0, 8)}...` }]);
        }
      }
    })();
  }, [currentSessionId]);

  // Save history on change
  useEffect(() => {
    if (currentSessionId && messages.length > 0) {
      saveChatHistory(currentSessionId, messages);
    }
  }, [messages, currentSessionId]);

  const handleSend = async (viewModeSetter: (mode: 'chat' | 'file') => void) => {
    if (!query.trim() || isThinking || !currentSessionId) return;
    const q = query.trim();
    setQuery('');
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setIsThinking(true);
    viewModeSetter('chat');

    try {
      const qRes = await ai.models.embedContent({
        model: CONFIG.embedModel,
        contents: [q]
      });
      const qVec = qRes.embeddings?.[0]?.values || [];

      // Web Worker for similarity calculation
      const ragWorker = new Worker(new URL('../workers/rag.worker.ts', import.meta.url), { type: 'module' });
      
      const relevant = await new Promise<ChunkDoc[]>((resolve) => {
        ragWorker.onmessage = (e) => resolve(e.data.relevant);
        ragWorker.postMessage({ qVec, db, topK: CONFIG.topK });
      });
      ragWorker.terminate();

      const ragContext = relevant.filter(r => !r.isMedia).map(r => r.text).join("\n\n");
      const mediaFiles = relevant.filter(r => r.isMedia);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parts: any[] = uploadedUris.map(f => ({ fileData: { mimeType: f.mimeType, fileUri: f.uri } }));
      
      // Add Local Media as InlineData
      const { getSessionFileBlob } = await import('../lib/db');
      for (const m of mediaFiles) {
        if (!currentSessionId) continue;
        const blob = await getSessionFileBlob(currentSessionId, m.file);
        if (blob) {
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          const cleanBase64 = base64.split(',')[1];
          parts.push({ inlineData: { mimeType: m.mimeType || 'image/jpeg', data: cleanBase64 } });
        }
      }

      const fullPrompt = `[RAG TEXT CONTEXT]\n${ragContext}\n\n[USER QUERY]\n${q}`;
      parts.push({ text: fullPrompt });
      
      const result = await ai.models.generateContent({
        model: selectedModel,
        contents: [{ role: 'user', parts }],
        config: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tools: useGrounding ? [{ googleSearch: {} }] : [] as any[],
          temperature: 0.2,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
          systemInstruction: {
            parts: [{
              text: `# Role & Objective
                  You are an expert coding agent dedicated to absolute factual accuracy. Your goal is to provide evidence-based answers derived exclusively from active web searches.
                  Current Date: ${new Date().toISOString()}
                  CRITICAL RULES:
                  # Core Directives
                  Use the provided CODE CONTEXT and ATTACHED FILES to answer.
                  - **File Modifications:** When suggesting code changes that the user can APPLY, you MUST provide the FULL and COMPLETE content of the file. Do not use placeholders or omit existing code, as the 'Apply' feature overwrites the entire target file.
                  - **Active Verification:** Do not rely on internal training data as it is outdated. Perform a fresh Google Search for every individual query.
                  - **Date Awareness:** Use the current date as a reference point for all time-sensitive information.
                  - **Grounding & Citations:** Every claim must be grounded in search results. Include clickable links to the sources used.
                  - **Uncertainty:** If current information is unavailable via search, explicitly state that the data is not accessible rather than providing outdated internal information.
                  Format your responses in clean Markdown.` }]
          }
        }
      });
      setMessages(prev => [...prev, { role: 'ai', text: result.text || "No response." }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'ai', text: `**Error:** ${e.message}` }]);
    } finally {
      setIsThinking(false);
    }
  };

  const startFullReview = async () => {
    if (uploadedUris.length === 0 || isThinking || !currentSessionId) return;
    setIsThinking(true);
    setMessages(prev => [...prev, { role: 'user', text: "Please perform a full architectural review of this repository." }]);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parts: any[] = uploadedUris.map(f => ({ fileData: { mimeType: f.mimeType, fileUri: f.uri } }));
      const promptText = "Perform a comprehensive technical review of this codebase. Analyze the architecture, key patterns, and potential optimizations.";
      parts.push({ text: promptText });

      const result = await ai.models.generateContent({
        model: selectedModel,
        contents: [{ role: 'user', parts }],
        config: {
          temperature: 0.1,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
          systemInstruction: {
            parts: [{ text: "You are a master software architect. Analyze the attached files and provide a deep technical audit." }]
          }
        }
      });
      setMessages(prev => [...prev, { role: 'ai', text: result.text || "Analysis complete." }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'ai', text: `**Review Error:** ${e.message}` }]);
    } finally {
      setIsThinking(false);
    }
  };

  const appendQuery = (text: string) => {
    setQuery(prev => prev + text);
  };

  const addMessage = (msg: Message) => {
    setMessages(prev => [...prev, msg]);
  }

  const deleteMessage = (index: number) => {
    setMessages(prev => prev.filter((_, i) => i !== index));
  };

  const clearMessages = () => {
    setMessages([{ role: 'ai', text: "Chat history purge successful." }]);
  };

  return {
    messages,
    query,
    setQuery,
    appendQuery,
    isThinking,
    selectedModel,
    setSelectedModel,
    useGrounding,
    setUseGrounding,
    handleSend,
    startFullReview,
    addMessage,
    deleteMessage,
    clearMessages
  };
}
