
import { StoredFile } from '../types';

// Dynamic imports to prevent crashing in standard web environment if packages are missing
let tauriFs: any = null;
let tauriPath: any = null;
let tauriDialog: any = null;

// Attempt to load Tauri APIs
const loadTauri = async () => {
  try {
    // @ts-ignore
    if (window.__TAURI_INTERNALS__) {
      // @ts-ignore
      tauriFs = await import('@tauri-apps/plugin-fs');
      // @ts-ignore
      tauriPath = await import('@tauri-apps/api/path');
      // @ts-ignore
      tauriDialog = await import('@tauri-apps/plugin-dialog');
      return true;
    }
  } catch (e) {
    console.log("Tauri not detected, running in Web Mode.");
  }
  return false;
};

// Initialize detection
const isTauriPromise = loadTauri();

class WorkspaceService {
  private channel: BroadcastChannel;
  private listeners: (() => void)[] = [];
  // Single User Mode: fixed ID
  private userId: string = 'default';
  private customUrl: string | null = null;

  constructor() {
    this.channel = new BroadcastChannel('workspace_updates');
    this.channel.onmessage = () => {
      this.notifyListeners();
    };
    
    // Load custom URL override
    this.customUrl = localStorage.getItem('astro_workspace_url');

    // Initialize Cleanup if in Desktop Mode
    this.isTauri().then(isDesktop => {
        if (isDesktop) {
            this.runDesktopCleanup();
        }
    });
  }

  // Compatibility method
  getUserId(): string {
    return this.userId;
  }

  async isTauri(): Promise<boolean> {
    return await isTauriPromise;
  }

  setApiUrl(url: string) {
    // 1. Trim whitespace
    let cleanUrl = url ? url.trim() : "";
    
    // 2. Remove trailing slash
    cleanUrl = cleanUrl.replace(/\/$/, "");

    // 3. Auto-prepend http:// if missing and the URL doesn't start with http/https
    if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) {
        cleanUrl = `http://${cleanUrl}`;
    }

    this.customUrl = cleanUrl;
    
    if (cleanUrl) {
        localStorage.setItem('astro_workspace_url', cleanUrl);
    } else {
        localStorage.removeItem('astro_workspace_url');
    }
    this.notifyListeners();
  }

  getApiUrl(): string {
     // If user set a custom URL, use it
     if (this.customUrl) return this.customUrl;
     
     if (typeof window === 'undefined') return 'http://127.0.0.1:3000';
     
     // Web mode default
     if (window.location.port === '3000') {
         return ''; 
     }
     
     const hostname = window.location.hostname;
     if (!hostname || hostname === 'localhost') {
        return 'http://127.0.0.1:3000';
     }
     return `http://${hostname}:3000`;
  }

  private getHeaders() {
    return {
      'Content-Type': 'application/json',
      'x-user-id': this.userId
    };
  }

  private async bufferToBase64(buffer: Uint8Array): Promise<string> {
    return new Promise((resolve) => {
        const blob = new Blob([buffer]);
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result as string;
            const base64 = dataUrl.split(',')[1];
            resolve(base64);
        };
        reader.readAsDataURL(blob);
    });
  }

  private base64ToBuffer(base64: string): Uint8Array {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  // --- TAURI HELPER: Get Workspace Dir ---
  private async getTauriDir() {
    if (!tauriPath || !tauriFs) throw new Error("Tauri APIs not loaded");
    
    // PERSISTENT MODE: Use the User's Documents folder
    // This creates 'Documents/Translate-App-Workspace' which persists even if the EXE is moved
    const docDir = await tauriPath.documentDir();
    return await tauriPath.join(docDir, 'Translate-App-Workspace');
  }

  // --- TAURI CLEANUP ---
  private async runDesktopCleanup() {
      try {
          const dir = await this.getTauriDir();
          // Check if directory exists before trying to read
          const exists = await tauriFs.exists(dir);
          if (!exists) return;

          console.log("[System] Running workspace cleanup in Documents...");
          const entries = await tauriFs.readDir(dir);
          const now = Date.now();
          const MAX_AGE = 25 * 24 * 60 * 60 * 1000; // 25 days
          let deletedCount = 0;

          for (const entry of entries) {
              // We only track expiration via the metadata files
              if (entry.isFile && entry.name.endsWith('.meta.json')) {
                  const metaPath = await tauriPath.join(dir, entry.name);
                  try {
                      const stats = await tauriFs.stat(metaPath);
                      const mtime = stats.mtime ? new Date(stats.mtime).getTime() : 0;
                      
                      if (mtime > 0 && (now - mtime > MAX_AGE)) {
                          // Expired: Delete metadata
                          await tauriFs.remove(metaPath);
                          
                          // Also try to delete the associated raw file
                          const rawFileName = entry.name.replace('.meta.json', '');
                          const rawPath = await tauriPath.join(dir, rawFileName);
                          if (await tauriFs.exists(rawPath)) {
                              await tauriFs.remove(rawPath);
                          }
                          deletedCount++;
                      }
                  } catch (err) {
                      console.warn(`Failed to stat/remove ${entry.name}`, err);
                  }
              }
          }
          if (deletedCount > 0) console.log(`[Cleanup] Removed ${deletedCount} old files.`);
      } catch (e) {
          console.warn("Desktop cleanup failed:", e);
      }
  }

  // --- EXPORT FILE (SAVE AS) ---
  async exportFile(id: string): Promise<void> {
    const file = await this.getFile(id);
    const isDesktop = await this.isTauri();

    if (isDesktop && tauriDialog) {
        try {
            // Determine extension filter
            const ext = file.name.includes('.') ? file.name.split('.').pop() : 'txt';
            
            const savePath = await tauriDialog.save({
                defaultPath: file.name,
                filters: [{
                    name: 'Export File',
                    extensions: [ext || '*']
                }]
            });

            if (!savePath) return; // User cancelled

            if (typeof file.content === 'string') {
                await tauriFs.writeTextFile(savePath, file.content);
            } else {
                await tauriFs.writeFile(savePath, file.content);
            }
        } catch (err: any) {
             console.error(err);
             throw new Error(`Export Failed: ${err.message}`);
        }
    } else {
        // Web Fallback
        const blob = new Blob([file.content], { type: file.mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
  }

  async saveFile(file: StoredFile): Promise<void> {
    const isDesktop = await this.isTauri();

    if (isDesktop) {
        // --- TAURI NATIVE SAVE ---
        try {
            const appDir = await this.getTauriDir();
            // Ensure directory exists in Documents
            const exists = await tauriFs.exists(appDir);
            if (!exists) {
                await tauriFs.mkdir(appDir, { recursive: true });
            }

            // Architecture:
            // 1. Save Raw Content to [Filename]
            // 2. Save Metadata to [Filename].meta.json
            
            const rawPath = await tauriPath.join(appDir, file.name);
            const metaPath = await tauriPath.join(appDir, `${file.name}.meta.json`);

            // 1. Write Content
            if (file.content instanceof Uint8Array) {
                await tauriFs.writeFile(rawPath, file.content);
            } else {
                await tauriFs.writeTextFile(rawPath, file.content);
            }

            // 2. Write Metadata (Exclude content to keep it lightweight)
            const { content, ...metaOnly } = file;
            await tauriFs.writeTextFile(metaPath, JSON.stringify(metaOnly, null, 2));

            this.channel.postMessage('update');
            this.notifyListeners();
            return;
        } catch (err: any) {
            console.error("Tauri Save Error", err);
            throw new Error(`Desktop Save Failed: ${err.message}`);
        }
    }

    // --- WEB SAVE ---
    const payload = { ...file };
    if (file.content instanceof Uint8Array) {
        // @ts-ignore
        payload.isBase64 = true;
        // @ts-ignore
        payload.content = await this.bufferToBase64(file.content);
    }

    const baseUrl = this.getApiUrl();
    const targetUrl = baseUrl ? `${baseUrl}/api/workspace` : '/api/workspace';

    try {
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
           const errText = await response.text();
           throw new Error(errText || response.statusText);
        }
        
        this.channel.postMessage('update');
        this.notifyListeners();
    } catch (error) {
        console.error("Workspace Save Error:", error);
        throw error; 
    }
  }

  async getFiles(): Promise<StoredFile[]> {
    const isDesktop = await this.isTauri();

    if (isDesktop) {
        // --- TAURI NATIVE LIST ---
        try {
            const appDir = await this.getTauriDir();
            const exists = await tauriFs.exists(appDir);
            if (!exists) return [];

            const entries = await tauriFs.readDir(appDir);
            const files: StoredFile[] = [];

            // Only scan for metadata files to build the list
            for (const entry of entries) {
                if (entry.name.endsWith('.meta.json')) {
                    try {
                        const content = await tauriFs.readTextFile(`${appDir}/${entry.name}`);
                        const meta = JSON.parse(content);
                        // Ensure we didn't accidentally read a malformed file
                        if (meta && meta.id && meta.name) {
                            files.push(meta);
                        }
                    } catch (e) {
                        console.warn(`Skipping corrupt meta file ${entry.name}`);
                    }
                }
            }
            return files.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        } catch (err) {
            console.error("Tauri List Error", err);
            return [];
        }
    }

    // --- WEB LIST ---
    const baseUrl = this.getApiUrl();
    const targetUrl = baseUrl ? `${baseUrl}/api/workspace` : '/api/workspace';

    try {
        const response = await fetch(targetUrl, {
            headers: this.getHeaders()
        });

        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }

        const files = await response.json();
        return files.sort((a: StoredFile, b: StoredFile) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    } catch (error) {
        console.warn("Workspace GetFiles Error:", error);
        throw error;
    }
  }

  async getFile(id: string): Promise<StoredFile> {
    const isDesktop = await this.isTauri();

    if (isDesktop) {
        // --- TAURI NATIVE READ ---
        try {
            const appDir = await this.getTauriDir();
            // We have the ID, but in the new system, we need to find which metadata file contains this ID.
            // Since we don't store "id.json" anymore, we iterate the meta files.
            // This is efficient enough for local workspace sizes (< few hundred files).
            
            const entries = await tauriFs.readDir(appDir);
            let foundMeta: StoredFile | null = null;

            for (const entry of entries) {
                if (entry.name.endsWith('.meta.json')) {
                    try {
                        const metaStr = await tauriFs.readTextFile(`${appDir}/${entry.name}`);
                        const meta = JSON.parse(metaStr);
                        if (meta.id === id) {
                            foundMeta = meta;
                            break;
                        }
                    } catch(e) {}
                }
            }

            if (!foundMeta) throw new Error("File metadata not found in workspace");

            // Now read the Raw Content using the name from metadata
            const rawPath = await tauriPath.join(appDir, foundMeta.name);
            
            if (!(await tauriFs.exists(rawPath))) {
                throw new Error(`Raw file '${foundMeta.name}' missing from disk`);
            }

            let rawContent: string | Uint8Array;
            
            // Intelligent Read: Check mimetype or extension
            const isBinary = 
                foundMeta.mimeType === 'application/vnd.sqlite3' || 
                foundMeta.name.endsWith('.db') || 
                foundMeta.name.endsWith('.sqlite') ||
                foundMeta.name.endsWith('.pdf'); // Add other binary types as needed

            if (isBinary) {
                rawContent = await tauriFs.readFile(rawPath);
            } else {
                // Default to Text for code/predictions
                rawContent = await tauriFs.readTextFile(rawPath);
            }

            return { ...foundMeta, content: rawContent };

        } catch (err: any) {
            throw new Error(`Desktop Read Failed: ${err.message}`);
        }
    }

    // --- WEB READ ---
    const baseUrl = this.getApiUrl();
    const targetUrl = baseUrl ? `${baseUrl}/api/workspace/${id}` : `/api/workspace/${id}`;

    try {
        const response = await fetch(targetUrl, {
            headers: this.getHeaders()
        });

        if (!response.ok) {
           throw new Error(`Failed to fetch file content: ${response.status}`);
        }

        const file = await response.json();
        
        if (file.isBase64) {
            file.content = this.base64ToBuffer(file.content);
        }
        
        return file;
    } catch (error) {
        console.error("Workspace GetFile Error:", error);
        throw error;
    }
  }

  async pickFile(extensions: string[] = []): Promise<{ name: string, content: Uint8Array } | null> {
    const isDesktop = await this.isTauri();
    if (isDesktop && tauriDialog && tauriFs && tauriPath) {
        try {
            const appDir = await this.getTauriDir();
            // Ensure directory exists
            if (!(await tauriFs.exists(appDir))) {
                await tauriFs.mkdir(appDir, { recursive: true });
            }

            const selected = await tauriDialog.open({
                defaultPath: appDir,
                multiple: false,
                filters: extensions.length > 0 ? [{ name: 'Supported Files', extensions }] : []
            });

            if (selected && typeof selected === 'string') {
                const name = await tauriPath.basename(selected);
                const content = await tauriFs.readFile(selected);
                return { name, content };
            }
        } catch (e) {
            console.error("Pick File Error:", e);
        }
    }
    return null;
  }

  async deleteFile(id: string): Promise<void> {
    const isDesktop = await this.isTauri();

    if (isDesktop) {
        // --- TAURI NATIVE DELETE ---
        try {
            const appDir = await this.getTauriDir();
            // Find the file first
            const entries = await tauriFs.readDir(appDir);
            
            for (const entry of entries) {
                if (entry.name.endsWith('.meta.json')) {
                    try {
                        const metaPath = `${appDir}/${entry.name}`;
                        const metaStr = await tauriFs.readTextFile(metaPath);
                        const meta = JSON.parse(metaStr);
                        
                        if (meta.id === id) {
                            // Delete Metadata
                            await tauriFs.remove(metaPath);
                            // Delete Raw File
                            const rawPath = await tauriPath.join(appDir, meta.name);
                            if (await tauriFs.exists(rawPath)) {
                                await tauriFs.remove(rawPath);
                            }
                            break; // Done
                        }
                    } catch(e) {}
                }
            }

            this.channel.postMessage('update');
            this.notifyListeners();
            return;
        } catch (err: any) {
            throw new Error(`Desktop Delete Failed: ${err.message}`);
        }
    }

    // --- WEB DELETE ---
    const baseUrl = this.getApiUrl();
    const targetUrl = baseUrl ? `${baseUrl}/api/workspace/${id}` : `/api/workspace/${id}`;

    try {
        const response = await fetch(targetUrl, {
            method: 'DELETE',
            headers: this.getHeaders()
        });
        
        if (!response.ok) throw new Error('Failed to delete file');
        
        this.channel.postMessage('update');
        this.notifyListeners();
    } catch (error) {
        console.error("Workspace Delete Error:", error);
        throw error;
    }
  }

  async clearWorkspace(): Promise<void> {
    const isDesktop = await this.isTauri();

    if (isDesktop) {
        // --- TAURI NATIVE CLEAR ---
        try {
            const appDir = await this.getTauriDir();
            const entries = await tauriFs.readDir(appDir);
            for (const entry of entries) {
                // Delete everything in workspace folder
                await tauriFs.remove(`${appDir}/${entry.name}`);
            }
            this.channel.postMessage('update');
            this.notifyListeners();
            return;
        } catch (err: any) {
            throw new Error(`Desktop Clear Failed: ${err.message}`);
        }
    }

    // --- WEB CLEAR ---
    const baseUrl = this.getApiUrl();
    const targetUrl = baseUrl ? `${baseUrl}/api/workspace` : '/api/workspace';

    try {
        const response = await fetch(targetUrl, {
            method: 'DELETE',
            headers: this.getHeaders()
        });

        if (!response.ok) throw new Error('Failed to clear workspace');
        
        this.channel.postMessage('update');
        this.notifyListeners();
    } catch (error) {
        console.error("Workspace Clear Error:", error);
        throw error;
    }
  }

  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(l => l());
  }
}

export const workspaceService = new WorkspaceService();
