import { createContext, Dispatch, ReactNode, SetStateAction, useContext, useState, useEffect } from 'react';
import { MODELS, getModelProvider } from '../../shared/models';
import { getModelAvailability } from '../lib/models';
import { ChunkDoc, FileNode, Message } from '../types';
import { RepoSession } from '../lib/db';

type UploadedUri = { uri: string; name: string; mimeType: string; size?: number };

type IndexerState = {
  sessions: RepoSession[];
  setSessions: Dispatch<SetStateAction<RepoSession[]>>;
  currentSessionId: string | null;
  setCurrentSessionId: Dispatch<SetStateAction<string | null>>;
  files: FileNode[];
  setFiles: Dispatch<SetStateAction<FileNode[]>>;
  isIndexing: boolean;
  setIsIndexing: Dispatch<SetStateAction<boolean>>;
  indexProgress: number;
  setIndexProgress: Dispatch<SetStateAction<number>>;
  indexState: string;
  setIndexState: Dispatch<SetStateAction<string>>;
  db: ChunkDoc[];
  setDb: Dispatch<SetStateAction<ChunkDoc[]>>;
  uploadedUris: UploadedUri[];
  setUploadedUris: Dispatch<SetStateAction<UploadedUri[]>>;
};

type AgentState = {
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  isThinking: boolean;
  setIsThinking: Dispatch<SetStateAction<boolean>>;
  selectedModel: string;
  setSelectedModel: Dispatch<SetStateAction<string>>;
  thinkingLevel: 'minimal' | 'low' | 'medium' | 'high';
  setThinkingLevel: Dispatch<SetStateAction<'minimal' | 'low' | 'medium' | 'high'>>;
  useGrounding: boolean;
  setUseGrounding: Dispatch<SetStateAction<boolean>>;
};

type UIState = {
  selectedFile: FileNode | null;
  setSelectedFile: Dispatch<SetStateAction<FileNode | null>>;
  viewMode: 'chat' | 'file';
  setViewMode: Dispatch<SetStateAction<'chat' | 'file'>>;
  showTerminal: boolean;
  setShowTerminal: Dispatch<SetStateAction<boolean>>;
};

type AppStateValue = {
  indexer: IndexerState;
  agent: AgentState;
  ui: UIState;
};

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<RepoSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState(0);
  const [indexState, setIndexState] = useState('Ready');
  const [db, setDb] = useState<ChunkDoc[]>([]);
  const [uploadedUris, setUploadedUris] = useState<UploadedUri[]>([]);

  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', text: '**Hello, I\'m your built-in repoview Coding Agent.**\n\n- Load your project files.\n- Click **Index & Upload** to prepare the context for your codebase.\n- Chat with me using RAG and Live Grounding.' },
  ]);
  const [query, setQuery] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  useEffect(() => {
    let active = true;
    getModelAvailability().then(({ providers }) => {
      if (!active) return;
      setSelectedModel(current => providers[getModelProvider(current)].configured
        ? current : MODELS.find(model => providers[model.provider].configured)?.id || current);
    }).catch(() => { /* The chat will display configuration errors when sending. */ });
    return () => { active = false; };
  }, []);
  const [thinkingLevel, setThinkingLevel] = useState<'minimal' | 'low' | 'medium' | 'high'>('medium');
  const [useGrounding, setUseGrounding] = useState(true);

  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [viewMode, setViewMode] = useState<'chat' | 'file'>('chat');
  const [showTerminal, setShowTerminal] = useState(false);

  return (
    <AppStateContext.Provider
      value={{
        indexer: {
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
        },
        agent: {
          messages,
          setMessages,
          query,
          setQuery,
          isThinking,
          setIsThinking,
          selectedModel,
          setSelectedModel,
          thinkingLevel,
          setThinkingLevel,
          useGrounding,
          setUseGrounding,
        },
        ui: {
          selectedFile,
          setSelectedFile,
          viewMode,
          setViewMode,
          showTerminal,
          setShowTerminal,
        },
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

function useAppState() {
  const value = useContext(AppStateContext);
  if (!value) {
    throw new Error('AppStateProvider is required');
  }
  return value;
}

export function useIndexerState() {
  return useAppState().indexer;
}

export function useAgentState() {
  return useAppState().agent;
}

export function useUIState() {
  return useAppState().ui;
}
