export interface ExtendedFile extends File {
  webkitRelativePath: string;
}

export interface FileNode {
  name: string;
  path: string;
  content?: string;
  blob?: Blob;
  type: string;
  isIndexed?: boolean;
}

export interface Message {
  role: 'user' | 'model' | 'ai';
  text: string;
}

export interface ChunkDoc {
  text: string;
  vec: number[];
  file: string;
  isMedia?: boolean;
  mimeType?: string;
}

export interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: Record<string, TreeNode>;
  file?: FileNode;
}
