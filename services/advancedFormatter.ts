
export class AdvancedFormatter {
  
  /**
   * Helper: Extracts a snippet with surrounding context (before/after).
   */
  private static getSnippet(text: string, index: number, length: number = 1): string {
      const start = Math.max(0, index - 15);
      const end = Math.min(text.length, index + length + 15);
      let snippet = text.substring(start, end).replace(/\n/g, '↵');
      if (start > 0) snippet = '...' + snippet;
      if (end < text.length) snippet = snippet + '...';
      return snippet;
  }

  /**
   * PUNCTUATION LOGIC
   * 1. No space before full-stop (.) or comma (,).
   * 2. Exactly one space after full-stop (.) or comma (,), unless it's end of line.
   */
  static formatPunctuation(text: string): string {
    if (!text) return text;
    let processed = text;

    // 1. Remove space before dot/comma
    // "Hello ." -> "Hello."
    processed = processed.replace(/\s+([.,])/g, '$1');

    // 2. Ensure exactly one space after dot/comma IF followed by non-whitespace
    // "Hello.World" -> "Hello. World"
    processed = processed.replace(/([.,])(?=[^\s])/g, '$1 ');

    return processed;
  }

  static getPunctuationIssues(text: string): { type: string, index: number, snippet: string }[] {
      const issues: { type: string, index: number, snippet: string }[] = [];
      if (!text) return issues;

      // Check space before: /\s+[.,]/
      const spaceBeforeRegex = /\s+([.,])/g;
      let match;
      while ((match = spaceBeforeRegex.exec(text)) !== null) {
          issues.push({
              type: 'Space Before',
              index: match.index,
              snippet: AdvancedFormatter.getSnippet(text, match.index, match[0].length)
          });
      }

      // Check no space after: /[.,][^\s]/
      // Note: We use positive lookahead in fix, here we match explicitly to get index
      const noSpaceAfterRegex = /([.,])([^\s])/g;
      while ((match = noSpaceAfterRegex.exec(text)) !== null) {
          issues.push({
              type: 'No Space After',
              index: match.index,
              snippet: AdvancedFormatter.getSnippet(text, match.index, 2)
          });
      }

      return issues;
  }

  /**
   * TABS LOGIC
   * Replaces the boolean check with a detailed scan returning snippets.
   */
  static getTabIssues(text: string): { snippet: string }[] {
      if (!text) return [];
      const issues: { snippet: string }[] = [];

      // Check for literal tabs to remove
      if (/\\t|\/t/.test(text)) {
           // Find location
           const idx = text.search(/\\t|\/t/);
           issues.push({ snippet: AdvancedFormatter.getSnippet(text, idx, 2) });
      }
      
      const lines = text.split('\n');
      for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.length === 0) continue;
          if (line.startsWith('\t')) continue; 
          if (trimmed.endsWith(':')) continue; 
          
          const wordCount = trimmed.split(/\s+/).length;
          if (wordCount >= 5) {
              // This line needs a tab but lacks it.
              // Snippet is the start of the line
              issues.push({ snippet: `[START] ${trimmed.substring(0, 40)}...` });
          }
      }
      return issues;
  }

  // Preserve original boolean method for backward compat if needed, or redirect
  static checkTabsNeeded(text: string): boolean {
     return AdvancedFormatter.getTabIssues(text).length > 0;
  }

  static formatTabs(text: string): string {
    if (!text) return text;
    const cleaned = text.replace(/\\t|\/t/g, '');
    return cleaned.split('\n').map(line => {
        const trimmed = line.trim();
        if (trimmed.length === 0) return line;
        if (line.startsWith('\t')) return line;
        if (trimmed.endsWith(':')) return line;
        const wordCount = trimmed.split(/\s+/).length;
        if (wordCount >= 5) return '\t' + line;
        return line;
    }).join('\n');
  }

  /**
   * WHITESPACE LOGIC
   * 3+ Spaces between words (ignores leading/trailing/line-end spaces)
   */
  static formatWhitespace(text: string): string {
      // Matches a non-whitespace char, followed by 3+ spaces, followed by a non-whitespace char (lookahead)
      // Replaces with the character and a single space.
      return text.replace(/(\S)[ ]{3,}(?=\S)/g, '$1 '); 
  }

  static getWhitespaceIssues(text: string): { snippet: string }[] {
      const issues: { snippet: string }[] = [];
      // Regex to find 3+ spaces between non-whitespace characters
      const regex = /(\S)([ ]{3,})(?=\S)/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
          issues.push({
              snippet: AdvancedFormatter.getSnippet(text, match.index, match[0].length)
          });
      }
      return issues;
  }
  
  // Compat
  static checkWhitespaceIssues(text: string): RegExpMatchArray | null {
      // Only returns matches strictly between words now
      return text.match(/(\S)[ ]{3,}(?=\S)/g);
  }

  /**
   * LINE SPACING LOGIC
   */
  static formatLineSpacing(text: string): string {
      if (!text) return text;
      let normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      normalized = normalized.replace(/[ \t]+$/gm, '');
      normalized = normalized.replace(/\n{3,}/g, '\n\n');
      return normalized;
  }

  static getLineSpacingIssues(text: string): { type: string, snippet: string }[] {
      const issues: { type: string, snippet: string }[] = [];
      if (!text) return issues;
      
      const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

      // 1. Excessive newlines
      let match;
      const nlRegex = /\n{3,}/g;
      while ((match = nlRegex.exec(normalized)) !== null) {
          issues.push({ 
              type: 'Excessive Newlines',
              snippet: '...[↵↵↵]...' 
          });
      }

      // 2. Trailing spaces (multiline)
      // We iterate lines to find indices of trailing spaces
      const trailingRegex = /[ \t]+$/gm;
      while ((match = trailingRegex.exec(normalized)) !== null) {
           issues.push({
               type: 'Trailing Space',
               snippet: AdvancedFormatter.getSnippet(normalized, match.index, match[0].length)
           });
      }

      return issues;
  }

  // Compat
  static checkLineSpacingNeeded(text: string): boolean {
      if (!text) return false;
      const formatted = AdvancedFormatter.formatLineSpacing(text);
      return formatted !== text;
  }
}
