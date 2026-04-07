import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { FileViewer } from './components/FileViewer';
import { ChatInterface } from './components/ChatInterface';
import { Terminal } from './components/Terminal';
import { useIndexer } from './hooks/useIndexer';
import { useAgent } from './hooks/useAgent';
import { FileNode } from './types';

import { getSessionFileContent } from './lib/db';
import { Maximize2, Terminal as TerminalIcon } from 'lucide-react';

export default function App() {
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [viewMode, setViewMode] = useState<'chat' | 'file'>('chat');
  const [showTerminal, setShowTerminal] = useState(false);

  const {
    sessions,
    currentSessionId,
    loadSession,
    files,
    isIndexing,
    indexProgress,
    indexState,
    db,
    uploadedUris,
    handleFileUpload,
    startIndexing
  } = useIndexer();

  const handleSelectFile = async (f: FileNode | null) => {
    if (!f || !currentSessionId) {
      setSelectedFile(null);
      return;
    }
    
    // Check if it's a known binary type
    const { getMimeType } = await import('./lib/gemini');
    const mime = getMimeType(f.path);
    const isBinary = !mime.startsWith('text/') && mime !== 'application/json' && !f.path.endsWith('.md') && !f.path.endsWith('.ts') && !f.path.endsWith('.tsx') && !f.path.endsWith('.js') && !f.path.endsWith('.css');
    
    const { getSessionFileBlob, getSessionFileContent } = await import('./lib/db');
    
    if (isBinary) {
      const blob = await getSessionFileBlob(currentSessionId, f.path);
      setSelectedFile({ ...f, blob: blob || undefined, content: '' });
    } else {
      const content = await getSessionFileContent(currentSessionId, f.path);
      setSelectedFile({ ...f, content: content || "" });
    }
  };

  const {
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
    clearMessages,
    deleteMessage,
    addMessage
  } = useAgent(db, uploadedUris, currentSessionId);

  const handleContextualize = (text: string) => {
    appendQuery(text);
  };

  const handleStartIndexing = () => {
    startIndexing(
      (newUris, newDb) => {
        addMessage({ role: 'ai', text: `**Indexing Complete.**\n- **${newUris.length}** files uploaded to Files API.\n- **${newDb.length}** RAG chunks indexed.` });
      },
      (e) => {
        addMessage({ role: 'ai', text: `**Indexing Failed:** ${e.message}` });
      }
    );
  };

  return (
    <div className="flex h-screen w-full jungle-grid overflow-hidden">
      <Sidebar
        files={files}
        selectedFile={selectedFile}
        onSelectFile={handleSelectFile}
        isIndexing={isIndexing}
        indexProgress={indexProgress}
        onFileUpload={handleFileUpload}
        onStartIndexing={handleStartIndexing}
        onStartFullReview={startFullReview}
        isThinking={isThinking}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onLoadSession={loadSession}
        onToggleTerminal={() => setShowTerminal(!showTerminal)}
        terminalActive={showTerminal}
      />
      <FileViewer 
        selectedFile={selectedFile} 
        onContextualize={handleContextualize} 
      />
      <ChatInterface
        messages={messages}
        query={query}
        setQuery={setQuery}
        isThinking={isThinking}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        indexState={indexState}
        useGrounding={useGrounding}
        setUseGrounding={setUseGrounding}
        onSend={() => handleSend(setViewMode)}
        onDeleteMessage={deleteMessage}
        onClear={clearMessages}
      />

      {showTerminal && <Terminal onClose={() => setShowTerminal(false)} />}
    </div>
  );
}
