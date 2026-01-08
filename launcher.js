/* launcher.js - CommonJS entry for pkg */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

// Directory where the EXE lives
const BASE_DIR = path.dirname(process.execPath);

// Workspace directory (created at runtime)
const WORKSPACE_DIR = path.join(BASE_DIR, "workspace");

// Project root inside pkg snapshot
const APP_DIR = path.join(__dirname);

// Create workspace if missing
if (!fs.existsSync(WORKSPACE_DIR)) {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
  console.log("✅ Workspace created:", WORKSPACE_DIR);
} else {
  console.log("ℹ️ Workspace exists:", WORKSPACE_DIR);
}

/**
 * Helper to start a node process using the embedded Node runtime
 */
function start(script, args = []) {
  const child = spawn(
    process.execPath,
    [path.join(APP_DIR, script), ...args],
    {
      cwd: WORKSPACE_DIR,
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "production"
      }
    }
  );

  child.on("exit", code => {
    console.log(`❌ ${script} exited with code ${code}`);
  });

  return child;
}

console.log("🚀 Starting AstroTranslate...");

// ---- START BACKEND SERVER (PORT 3000) ----
// server.js must NOT rely on npm or Vite
start("server.js");

// ---- START MODEL / DEV PROCESS (PORT 3001) ----
// If your port 3001 logic is in cli.ts → compiled to cli.js
// Make sure cli.js exists or change filename here
start("cli.js");

console.log("✅ All services started");
console.log("🌐 http://localhost:3000");
console.log("🤖 http://localhost:3001");
