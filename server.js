
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Attempt to load .env if available (optional support for local dev with dotenv)
try { require('dotenv').config(); } catch (e) {}

const PORT = process.env.PORT || 3000;
const WORKSPACE_DIR = path.join(__dirname, 'dist', 'workspaces');

// Ensure workspace directory exists
if (!fs.existsSync(WORKSPACE_DIR)) {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
}

// --- CLEANUP ROUTINE ---
// Automatically delete files older than 25 days
function cleanupOldFiles() {
  console.log('Running workspace cleanup (Threshold: 25 days)...');
  const userDir = path.join(WORKSPACE_DIR, 'default');
  if (fs.existsSync(userDir)) {
    try {
      const files = fs.readdirSync(userDir);
      const now = Date.now();
      const TWENTY_FIVE_DAYS_MS = 25 * 24 * 60 * 60 * 1000;
      let deletedCount = 0;

      files.forEach(file => {
        const filePath = path.join(userDir, file);
        try {
            const stats = fs.statSync(filePath);
            if (now - stats.mtimeMs > TWENTY_FIVE_DAYS_MS) {
               fs.unlinkSync(filePath);
               deletedCount++;
            }
        } catch (e) {
            // Ignore error if file disappears or stat fails
        }
      });
      if (deletedCount > 0) {
        console.log(`Cleanup: Deleted ${deletedCount} files older than 25 days.`);
      } else {
        console.log('Cleanup: No old files found.');
      }
    } catch (err) {
      console.error('Cleanup Error:', err);
    }
  }
}

// Run cleanup on startup ONLY
cleanupOldFiles();
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

const MAX_BODY_SIZE = 200 * 1024 * 1024; // 200MB limit for DB files

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

    // LIST FILES (METADATA ONLY) - Prevents JSON string length error
    if (req.method === 'GET' && urlPath === '/api/workspace') {
      try {
        const files = fs.readdirSync(userDir)
          .filter(file => file.endsWith('.json'))
          .map(file => {
            try {
              // We read the file but omit 'content' field in the list response
              const content = fs.readFileSync(path.join(userDir, file), 'utf8');
              const data = JSON.parse(content);
              const { content: _, ...meta } = data; // Omit content
              return meta;
            } catch (readErr) {
              console.error(`Skipping corrupt file ${file}:`, readErr);
              return null;
            }
          })
          .filter(item => item !== null);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(files));
      } catch (err) {
        console.error(err);
        res.writeHead(500);
        res.end(JSON.stringify({ error: 'Failed to list files' }));
      }
      return;
    }

    // GET FILE CONTENT (SPECIFIC FILE)
    if (req.method === 'GET' && urlPath.startsWith('/api/workspace/')) {
        const fileId = urlPath.split('/').pop();
        const filePath = path.join(userDir, `${fileId}.json`);
        if (fs.existsSync(filePath)) {
            // Stream the file to avoid loading huge JSON in memory for res.end() string/buffer limit
            const readStream = fs.createReadStream(filePath);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            readStream.pipe(res);
        } else {
             res.writeHead(404);
             res.end(JSON.stringify({ error: 'File not found' }));
        }
        return;
    }

    // SAVE FILE
    if (req.method === 'POST' && urlPath === '/api/workspace') {
      const chunks = [];
      let receivedSize = 0;
      let hasError = false;
      
      req.on('data', chunk => {
        if (hasError) return;
        
        receivedSize += chunk.length;
        // Prevent huge payloads crashing the server
        if (receivedSize > MAX_BODY_SIZE) {
             hasError = true;
             res.writeHead(413, {
                 'Content-Type': 'application/json',
                 'Access-Control-Allow-Origin': '*' // Ensure client sees the error
             });
             res.end(JSON.stringify({error: 'File too large (Max 200MB)'}));
             req.destroy();
             return;
        }
        chunks.push(chunk);
      });
      
      req.on('end', () => {
        if (hasError) return;
        try {
          const bodyBuffer = Buffer.concat(chunks);
          if (bodyBuffer.length === 0) throw new Error('Empty body');
          
          const body = bodyBuffer.toString('utf8');
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

  const injectEnvAndSend = (res, content) => {
    // FORCE NO CACHE for HTML to ensure API key is always injected fresh
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const apiKey = (process.env.API_KEY || '').trim();
    let html = content.toString('utf-8');
    // Inject global var before closing head
    if (html.includes('</head>')) {
        html = html.replace('</head>', `<script>window.__SERVER_ENV__={API_KEY:"${apiKey}"}</script></head>`);
    } else {
        // Fallback if no head tag
        html += `<script>window.__SERVER_ENV__={API_KEY:"${apiKey}"}</script>`;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html, 'utf-8');
  };

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
                injectEnvAndSend(res, content);
            }
        });
      } else {
        res.writeHead(500);
        res.end('Server Error: '+error.code);
      }
    } else {
      if (extname === '.html') {
          injectEnvAndSend(res, content);
      } else {
          // Allow caching for assets (JS/CSS)
          res.setHeader('Cache-Control', 'public, max-age=31536000');
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content, 'utf-8');
      }
    }
  });

});

// Bind to 0.0.0.0 to accept connections from all interfaces (fixes IPv4 vs IPv6 localhost issues)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log(`Workspace Storage: ${WORKSPACE_DIR}`);
  if (process.env.API_KEY) console.log("API Key loaded from environment.");
});
