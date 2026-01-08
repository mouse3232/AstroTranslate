// server.js - HTTP server serving static frontend + workspace API
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;

// Use EXE directory as base to store workspace outside the exe
const EXE_DIR = path.dirname(process.execPath);
const WORKSPACE_DIR = path.join(EXE_DIR, "workspace");

// Ensure workspace exists
if (!fs.existsSync(WORKSPACE_DIR)) {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
}

// --- CLEANUP ROUTINE ---
function cleanupOldFiles() {
  console.log("Running workspace cleanup...");
  const userDir = path.join(WORKSPACE_DIR, "default");
  if (fs.existsSync(userDir)) {
    try {
      const files = fs.readdirSync(userDir);
      const now = Date.now();
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      let deletedCount = 0;

      files.forEach((file) => {
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
        console.log("Cleanup: No old files found.");
      }
    } catch (err) {
      console.error("Cleanup Error:", err);
    }
  }
}

// Run cleanup on startup and every 24h
cleanupOldFiles();
setInterval(cleanupOldFiles, 24 * 60 * 60 * 1000);

// --- MIME TYPES ---
const MIME_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".woff": "application/font-woff",
  ".ttf": "application/font-ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".otf": "application/font-otf",
  ".wasm": "application/wasm",
};

// Serve static frontend from dist folder
const STATIC_DIR = path.join(EXE_DIR, "dist");

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-user-id");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlPath = req.url.split("?")[0];

  // Workspace API
  if (urlPath.startsWith("/api/workspace")) {
    const userDir = path.join(WORKSPACE_DIR, "default");
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });

    // LIST FILES
    if (req.method === "GET" && urlPath === "/api/workspace") {
      try {
        const files = fs
          .readdirSync(userDir)
          .filter((f) => f.endsWith(".json"))
          .map((file) => {
            try {
              const content = fs.readFileSync(path.join(userDir, file), "utf8");
              return JSON.parse(content);
            } catch {
              return null;
            }
          })
          .filter((item) => item !== null);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(files));
      } catch {
        res.writeHead(500);
        res.end(JSON.stringify({ error: "Failed to list files" }));
      }
      return;
    }

    // SAVE FILE
    if (req.method === "POST" && urlPath === "/api/workspace") {
      let body = "";
      let hasError = false;

      req.on("data", (chunk) => {
        body += chunk.toString();
        if (body.length > 50 * 1024 * 1024) {
          hasError = true;
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "File too large" }));
          req.destroy();
        }
      });

      req.on("end", () => {
        if (hasError) return;
        try {
          if (!body) throw new Error("Empty body");
          const fileData = JSON.parse(body);
          if (!fileData.id || !fileData.name) throw new Error("Invalid file data");
          const filePath = path.join(userDir, `${fileData.id}.json`);
          fs.writeFileSync(filePath, JSON.stringify(fileData));
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: "Failed to save file: " + err.message }));
        }
      });
      return;
    }

    // DELETE FILE
    if (req.method === "DELETE") {
      if (urlPath === "/api/workspace") {
        // Clear workspace
        try {
          const files = fs.readdirSync(userDir);
          for (const f of files) fs.unlinkSync(path.join(userDir, f));
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        } catch {
          res.writeHead(500);
          res.end(JSON.stringify({ error: "Failed to clear workspace" }));
        }
        return;
      } else if (urlPath.startsWith("/api/workspace/")) {
        const fileId = urlPath.split("/").pop();
        const filePath = path.join(userDir, `${fileId}.json`);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: "File not found" }));
        }
        return;
      }
    }
  }

  // Static file serving
  let filePath = path.join(STATIC_DIR, urlPath);
  if (urlPath === "/" || urlPath === "") filePath = path.join(STATIC_DIR, "index.html");
  else if (urlPath.endsWith("/")) filePath = path.join(filePath, "index.html");

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === "ENOENT") {
        // SPA fallback
        fs.readFile(path.join(STATIC_DIR, "index.html"), (err2, content2) => {
          if (err2) {
            res.writeHead(500);
            res.end("Error loading index.html");
          } else {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(content2);
          }
        });
      } else {
        res.writeHead(500);
        res.end("Server Error: " + err.code);
      }
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log(`Workspace storage: ${WORKSPACE_DIR}`);
});
