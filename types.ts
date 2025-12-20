export interface TranslationRequest {
  text: string;
  targetLanguage: string;
}

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
}

export type ProcessingMode = 'translate' | 'rewrite';

export interface ParsedBlock {
  raw: string;      // The full raw string of the block including trailing newlines
  header: string;   // The line starting with #*
  contentLines: string[]; // Content split by newline
  separator: string; // The trailing whitespace/newline characters found after the block
}

export interface FileStructure {
  preamble: string; // Content before the first #* block (e.g. filename)
  blocks: ParsedBlock[];
}

export interface ProcessingItem {
  text: string;
  context: 'Male' | 'Female' | 'Neutral';
  blockId: string; // unique id to map back
  lineIndex: number;
}
