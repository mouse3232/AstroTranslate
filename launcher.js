// launcher.js - CommonJS entry for pkg EXE

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

// Directory where the EXE is located
const EXE_DIR = path.dirname(process.execPath);

// Workspace folder (created next to EXE)
const WORKSPACE_DIR = path.join(EXE_DIR, "workspace");
if (!fs.existsSync(WORKSPACE_DIR)) {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
  console.log("✅ Workspace created at:", WORKSPACE_DIR);
} else {
  console.log("ℹ️ Workspace exists at:", WORKSPACE_DIR);
}

// Directory inside exe where scripts exist
const APP_DIR = __dirname;

// Helper to start a Node process
function start(script, args) {
  if (!args) args = [];

  const child = spawn(
    process.execPath,
    [path.join(APP_DIR, script), ...args],
    {
      cwd: WORKSPACE_DIR,
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "production" },
    }
  );

  child.on("exit", (code) => {
    console.log(`❌ ${script} exited with code ${code}`);
  });

  child.on("error", (err) => {
    console.error(`Failed to start ${script}:`, err);
  });

  return child;
}

console.log("🚀 Starting servers...");

// Start backend server on port 3000
start("server.js");

// Start model/dev server on port 3001
start("cli.js");

console.log("✅ All services started");
console.log("🌐 http://localhost:3000");
console.log("🤖 http://localhost:3001");
