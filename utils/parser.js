
const parseInputFile = (content) => {
  const firstBlockIndex = content.search(/(^|\n)#\*/);

  if (firstBlockIndex === -1) {
    return { preamble: content, blocks: [] };
  }

  const preamble = content.substring(0, firstBlockIndex);
  const rawBlocksSection = content.substring(firstBlockIndex);

  const rawBlocks = rawBlocksSection
    .split(/(?=^#\*)/gm)
    .filter(b => b.trim().length > 0);

  const blocks = rawBlocks.map(raw => {
    const lines = raw.split(/\r?\n/);

    const headerIndex = lines.findIndex(l => l.startsWith('#*'));
    const header = headerIndex !== -1 ? lines[headerIndex] : '';

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

const identifyTranslatableLines = (lines) => {
  return lines.map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) return false;
    if (trimmed.length === 0) return false;
    return true;
  });
};

const getGenderFromHeader = (header) => {
  if (header.includes('Sex=0')) return 'Male';
  if (header.includes('Sex=1')) return 'Female';
  return 'Neutral';
};

const updateHeaderSex = (header, sex) => {
  const trimmedHeader = header.trim();
  if (trimmedHeader.includes('Sex=')) {
    return trimmedHeader.replace(/Sex=\d/, `Sex=${sex}`);
  }
  return `${trimmedHeader},Sex=${sex}`;
};

const identifyTargetColumns = (tableName, allColumns) => {
  const lowerName = tableName.toLowerCase();
  let targets = [];

  if (lowerName.endsWith('_header')) {
     targets = ['text', 'text1', 'text2', 'notes1', 'notes2'];
  } else {
     targets = ['text', 'prediction', 'question', 'category', 'header'];
     for(let i=1; i<=8; i++) targets.push(`text${i}`);
  }

  return allColumns.filter(c => targets.includes(c.toLowerCase()));
};

module.exports = {
    parseInputFile,
    identifyTranslatableLines,
    getGenderFromHeader,
    updateHeaderSex,
    identifyTargetColumns
};
