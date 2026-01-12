
import { FileStructure, ParsedBlock } from '../types';

/**
 * Parses the file into a Preamble (e.g. filename) and Blocks.
 * Preserves exact structure.
 */
export const parseInputFile = (content: string): FileStructure => {
  // Find index of first #* that is at the start of a line
  const firstBlockIndex = content.search(/(^|\n)#\*/);
  
  if (firstBlockIndex === -1) {
    // No blocks found, treat whole file as preamble
    return { preamble: content, blocks: [] };
  }

  // Preamble is everything before the first #*
  // We use the index found. Note that if match included \n before #*, search returns index of \n.
  // We want to split exactly at that point to preserve the spacing in preamble vs block.
  
  const preamble = content.substring(0, firstBlockIndex);
  const rawBlocksSection = content.substring(firstBlockIndex);
  
  // Split the blocks section by lookahead for start of block `#*`
  // We filter out empty strings because split can return empty string at start
  const rawBlocks = rawBlocksSection
    .split(/(?=^#\*)/gm)
    .filter(b => b.trim().length > 0);
  
  const blocks: ParsedBlock[] = rawBlocks.map(raw => {
    const lines = raw.split(/\r?\n/);
    
    // Identify header
    const headerIndex = lines.findIndex(l => l.startsWith('#*'));
    const header = headerIndex !== -1 ? lines[headerIndex] : '';
    
    // Content lines are everything after header.
    const contentLines = headerIndex !== -1 ? lines.slice(headerIndex + 1) : lines;

    return {
      raw,
      header,
      contentLines,
      separator: '' 
    };
  });

  return { preamble, blocks };
};

/**
 * Identify which lines are translatable text.
 * Skips lines starting with # (syntax).
 * Skips empty lines.
 */
export const identifyTranslatableLines = (lines: string[]): boolean[] => {
  return lines.map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) return false;
    if (trimmed.length === 0) return false;
    return true;
  });
};

/**
 * Helper to determine gender from header
 */
export const getGenderFromHeader = (header: string): 'Male' | 'Female' | 'Neutral' => {
  if (header.includes('Sex=0')) return 'Male';
  if (header.includes('Sex=1')) return 'Female';
  return 'Neutral';
};

/**
 * Updates the header line with specific sex.
 */
export const updateHeaderSex = (header: string, sex: 0 | 1): string => {
  const trimmedHeader = header.trim();
  if (trimmedHeader.includes('Sex=')) {
    return trimmedHeader.replace(/Sex=\d/, `Sex=${sex}`);
  }
  // Append if missing.
  return `${trimmedHeader},Sex=${sex}`;
};

/**
 * Identifies action columns based on table name rules.
 */
export const identifyTargetColumns = (tableName: string, allColumns: string[]): string[] => {
  const lowerName = tableName.toLowerCase();
  let targets: string[] = [];

  if (lowerName.endsWith('_header')) {
     // Rule: For tables ending with name _header: Text, Text1, Text2 and notes1, notes2
     targets = ['text', 'text1', 'text2', 'notes1', 'notes2'];
  } else {
     // Rule: Text, Prediction, Question, Category, Header, Text1...Text8
     targets = ['text', 'prediction', 'question', 'category', 'header'];
     for(let i=1; i<=8; i++) targets.push(`text${i}`);
  }
  
  // Filter allColumns to only return those that match targets (case-insensitive)
  return allColumns.filter(c => targets.includes(c.toLowerCase()));
};
