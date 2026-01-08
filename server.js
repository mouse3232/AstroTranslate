
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const WORKSPACE_DIR = path.join(__dirname, 'dist', 'workspaces');

// Ensure workspace directory exists
if (!fs.existsSync(WORKSPACE_DIR)) {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
}

// --- CLEANUP ROUTINE ---
// Automatically delete files older than 30 days
function cleanupOldFiles() {
  console.log('Running workspace cleanup...');
  const userDir = path.join(WORKSPACE_DIR, 'default');
  if (fs.existsSync(userDir)) {
    try {
      const files = fs.readdirSync(userDir);
      const now = Date.now();
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      let deletedCount = 0;

      files.forEach(file => {
        const filePath = path.join(userDir, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > THIRTY_DAYS_MS) {
           fs.unlinkSync(filePath);
           deletedCount++;
        }
      });
      if (deletedCount > 0) {
        console.log(`Cleanup: Deleted ${deletedCount} files older than 30 days.`);
      } else {
        console.log('Cleanup: No old files found.');
      }
    } catch (err) {
      console.error('Cleanup Error:', err);
    }
  }
}

// Run cleanup on startup
cleanupOldFiles();
// Run cleanup every 24 hours
setInterval(cleanupOldFiles, 24 * 60 * 60 * 1000);
// -----------------------

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.woff': 'application/font-woff',
  '.ttf': 'application/font-ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'application/font-otf',
  '.wasm': 'application/wasm'
};

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-user-id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // SINGLE USER MODE: Ignore x-user-id header and use 'default'
  const userId = 'default';
  const urlPath = req.url.split('?')[0]; // Ignore query params
  
  // API Endpoints
  if (urlPath.startsWith('/api/workspace')) {
    const userDir = path.join(WORKSPACE_DIR, userId);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    // LIST FILES
    if (req.method === 'GET' && urlPath === '/api/workspace') {
      try {
        const files = fs.readdirSync(userDir)
          .filter(file => file.endsWith('.json'))
          .map(file => {
            try {
              const content = fs.readFileSync(path.join(userDir, file), 'utf8');
              return JSON.parse(content);
            } catch (readErr) {
              console.error(`Skipping corrupt file ${file}:`, readErr);
              return null;
            }
          })
          .filter(item => item !== null); // Filter out failed reads

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(files));
      } catch (err) {
        console.error(err);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Failed to list files' }));
      }
      return;
    }

    // SAVE FILE
    if (req.method === 'POST' && urlPath === '/api/workspace') {
      let body = '';
      let hasError = false;
      
      req.on('data', chunk => {
        body += chunk.toString();
        // Prevent huge payloads (e.g. > 50MB) crashing the server
        if (body.length > 50 * 1024 * 1024) {
             hasError = true;
             res.writeHead(413, {'Content-Type': 'application/json'});
             res.end(JSON.stringify({error: 'File too large (Max 50MB)'}));
             req.destroy();
        }
      });
      
      req.on('end', () => {
        if (hasError) return;
        try {
          if (!body) throw new Error('Empty body');
          const fileData = JSON.parse(body);
          if (!fileData.id || !fileData.name) {
            throw new Error('Invalid file data');
          }
          const filePath = path.join(userDir, `${fileData.id}.json`);
          fs.writeFileSync(filePath, JSON.stringify(fileData));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (err) {
          console.error(err);
          res.writeHead(500);
          res.end(JSON.stringify({ error: 'Failed to save file: ' + err.message }));
        }
      });
      return;
    }

    // DELETE FILE
    if (req.method === 'DELETE' && urlPath.startsWith('/api/workspace/')) {
      const fileId = urlPath.split('/').pop();
      const filePath = path.join(userDir, `${fileId}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'File not found' }));
      }
      return;
    }

    // CLEAR WORKSPACE
    if (req.method === 'DELETE' && urlPath === '/api/workspace') {
        try {
            const files = fs.readdirSync(userDir);
            for (const file of files) {
                fs.unlinkSync(path.join(userDir, file));
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Failed to clear workspace' }));
        }
        return;
    }
  }

  // Static File Serving
  // FIX: Use urlPath (without query params) to find files on disk
  let filePath = '.' + urlPath;
  if (filePath === './') {
    filePath = './index.html';
  } else if (filePath.endsWith('/')) {
    filePath += 'index.html';
  }

  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if(error.code == 'ENOENT') {
        // SPA Fallback: serve index.html for unknown paths (likely client-side routes)
        fs.readFile('./index.html', (error, content) => {
            if (error) {
                // If index.html is missing, server is likely running in root not dist, or build missing
                res.writeHead(500);
                res.end('Error loading index.html. Run npm run build first.');
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(content, 'utf-8');
            }
        });
      } else {
        res.writeHead(500);
        res.end('Server Error: '+error.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });

});

// Bind to 0.0.0.0 to accept connections from all interfaces (fixes IPv4 vs IPv6 localhost issues)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log(`Workspace Storage: ${WORKSPACE_DIR}`);
});
