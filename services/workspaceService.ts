
import { StoredFile } from '../types';

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
  }

  // Compatibility method
  getUserId(): string {
    return this.userId;
  }

  // Removed setUserId as it is now single-user

  setApiUrl(url: string) {
    // 1. Trim whitespace
    let cleanUrl = url ? url.trim() : "";
    
    // 2. Remove trailing slash
    cleanUrl = cleanUrl.replace(/\/$/, "");

    // 3. Auto-prepend http:// if missing and the URL doesn't start with http/https
    // This fixes the issue where user types "localhost:3000" and it breaks fetch
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
     // If user set a custom URL, use it (it now definitely has http://)
     if (this.customUrl) return this.customUrl;
     
     if (typeof window === 'undefined') return 'http://127.0.0.1:3000';
     
     // If serving from the same port (e.g. production build served by server.js), use relative path
     if (window.location.port === '3000') {
         return ''; 
     }
     
     // Fallback for dev mode (e.g. Vite on 5173 connecting to Node on 3000)
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

  async saveFile(file: StoredFile): Promise<void> {
    const payload = { ...file };
    
    if (file.content instanceof Uint8Array) {
        // @ts-ignore
        payload.isBase64 = true;
        // @ts-ignore
        payload.content = await this.bufferToBase64(file.content);
    }

    // Construct URL carefully
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

        // Files now only contain metadata. Content is fetched on demand via getFile(id).
        // Sorting by date
        return files.sort((a: StoredFile, b: StoredFile) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    } catch (error) {
        console.warn("Workspace GetFiles Error:", error);
        throw error;
    }
  }

  async getFile(id: string): Promise<StoredFile> {
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

  async deleteFile(id: string): Promise<void> {
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
