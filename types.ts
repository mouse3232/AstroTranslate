
export interface TranslationRequest {
  text: string;
  targetLanguage: string;
}

// Global Target Languages (Union of all apps)
export enum TargetLanguage {
  English = 'English',
  Hindi = 'Hindi',
  Bengali = 'Bengali',
  Telugu = 'Telugu',
  Marathi = 'Marathi',
  Tamil = 'Tamil',
  Gujarati = 'Gujarati',
  Kannada = 'Kannada',
  Odia = 'Odia',
  Malayalam = 'Malayalam',
  Punjabi = 'Punjabi',
  Nepali = 'Nepali',
  Spanish = 'Spanish',
  Assamese = 'Assamese',
  Other = 'Other',
}

export type ProcessingMode = 'translate' | 'rewrite' | 'convert_encoding';

export interface ParsedBlock {
  raw: string;
  header: string;
  contentLines: string[];
  separator: string;
}

export interface FileStructure {
  preamble: string;
  blocks: ParsedBlock[];
}

export interface ProcessingItem {
  text: string;
  context: 'Male' | 'Female' | 'Neutral';
  blockId: string;
  lineIndex: number;
}

export interface BatchResponse {
  text: string;
  metadata?: {
    wasCorrected: boolean;
    originalDecoded?: string;
    reason?: string;
    source?: string;
  };
}

// App Status Types
export enum AppStatus {
  IDLE = 'IDLE',
  READING_FILE = 'READING_FILE',
  TRANSLATING = 'TRANSLATING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export enum SourceLanguage {
  ENGLISH = 'English',
  HINDI = 'Hindi'
}

export interface ResourceTranslationResult {
  originalFileName: string;
  originalContent: string;
  translatedContent: string;
}

export interface ProcessingError {
  message: string;
  details?: string;
}

// Database Module Types
export interface DatabaseTask {
  table: string;
  columns: string[];
  rowCount: number;
  hasSexCol: boolean;
}

// Workspace Types
export interface StoredFile {
  id: string;
  name: string;
  type: 'source' | 'destination';
  content: string | Uint8Array; // String for text, Uint8Array for binary (DB)
  mimeType: string;
  size: number;
  createdAt: Date;
}
