
export class AdvancedFormatter {
  /**
   * Enforces tab rules:
   * 1. Remove literal '/t' and '\t' anywhere in text.
   * 2. Ensure every non-empty line starts with a real tab character IF it has 5 or more words.
   * 3. If line already starts with tab, do nothing.
   * 4. If line ends with ':', do nothing.
   */
  static formatTabs(text: string): string {
    if (!text) return text;
    
    // c) Remove literal escaped tab characters users might have typed
    const cleaned = text.replace(/\\t|\/t/g, '');
    
    return cleaned.split('\n').map(line => {
        const trimmed = line.trim();
        
        // Skip empty lines
        if (trimmed.length === 0) return line;
        
        // b) If line already starts with tab, do nothing (preserve existing indentation)
        if (line.startsWith('\t')) {
            return line;
        }

        // d) Do not add tab in sentences ends with colon ':'
        if (trimmed.endsWith(':')) {
            return line;
        }

        // a) Put tab at start of every line if it has 5 or more words.
        const wordCount = trimmed.split(/\s+/).length;
        if (wordCount >= 5) {
            return '\t' + line;
        }

        // Default: return original line (no tab added if < 5 words and no existing tab)
        return line;
    }).join('\n');
  }

  /**
   * Detects language contamination.
   * Returns an array of line indices (0-based) that violate the rule.
   */
  static detectLanguageIssues(text: string, expectedLang: 'English' | 'Hindi'): number[] {
    const lines = text.split('\n');
    const issues: number[] = [];
    
    // Hindi Unicode Range: \u0900-\u097F
    const hindiRegex = /[\u0900-\u097F]+/;
    // English Alpha Range: [a-zA-Z]+
    const englishRegex = /[a-zA-Z]+/;

    lines.forEach((line, index) => {
        // Ignore lines that are just numbers or symbols
        const content = line.trim();
        if (!content) return;

        if (expectedLang === 'Hindi') {
            // A Hindi file should NOT contain English words
            // We ignore tags like <Var> or simple variables if possible, but strict check for now
            // Removing common variable patterns before checking
            const cleanLine = content.replace(/<[^>]+>/g, '').replace(/%[a-zA-Z]/g, '');
            if (englishRegex.test(cleanLine)) {
                issues.push(index);
            }
        } else {
            // English file should NOT contain Hindi characters
            if (hindiRegex.test(content)) {
                issues.push(index);
            }
        }
    });

    return issues;
  }

  /**
   * Custom check for specific patterns
   */
  static customCheck(text: string, regexPattern: string): number[] {
    try {
        const regex = new RegExp(regexPattern);
        const lines = text.split('\n');
        const matches: number[] = [];
        lines.forEach((line, i) => {
            if (regex.test(line)) matches.push(i);
        });
        return matches;
    } catch (e) {
        return [];
    }
  }
}
