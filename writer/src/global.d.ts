export type Settings = {
  folder: string | null;
  lastFile: string | null;
  exportFolder: string | null;
  theme: 'system' | 'light' | 'dark';
  fontSize: number;
  grammar: boolean;
  sidebar: boolean;
  typewriter: boolean;
  lineWidth: 'narrow' | 'medium' | 'wide';
};

export type FileEntry = {
  path: string;
  rel: string;
  name: string;
  title: string;
  mtime: number;
  words: number;
};

type Unsubscribe = () => void;

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string;
    writer: {
      platform: string;
      getSettings(): Promise<Settings>;
      setSettings(patch: Partial<Settings>): Promise<Settings>;
      chooseFolder(): Promise<string | null>;
      listFiles(): Promise<FileEntry[]>;
      readFile(path: string): Promise<string>;
      writeFile(path: string, content: string): Promise<boolean>;
      createFile(title?: string): Promise<string>;
      renameFile(path: string, title: string): Promise<string>;
      trashFile(path: string): Promise<boolean>;
      revealFile(path: string): Promise<void>;
      assetDataUrl(docPath: string, rel: string): Promise<string>;
      importAsset(docPath: string, name: string, bytes: Uint8Array): Promise<string>;
      saveDrawing(docPath: string, id: string, scene: string, svg: string): Promise<string>;
      loadDrawing(docPath: string, rel: string): Promise<{ svg: string | null; scene: string | null }>;
      exportBlog(docPath: string, markdown: string, choose?: boolean): Promise<string | null>;
      learnWord(word: string): Promise<void>;
      closeReady(): Promise<void>;
      onMenu(fn: (command: string, arg?: unknown) => void): Unsubscribe;
      onSettings(fn: (s: Settings) => void): Unsubscribe;
    };
  }
}
