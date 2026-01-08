const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const BASE_DIR = path.dirname(process.execPath);
const WORKSPACE_DIR = path.join(BASE_DIR, "workspace");

if (!fs.existsSync(WORKSPACE_DIR)) {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
  console.log("Workspace created:", WORKSPACE_DIR);
}

// Start backend server (3000)
spawn(
  process.execPath,
  [path.join(__dirname, "server.js")],
  {
    cwd: WORKSPACE_DIR,
    stdio: "inherit"
  }
);

// Start model / dev node (3001)
spawn(
  process.execPath,
  [path.join(__dirname, "cli.js")],
  {
    cwd: WORKSPACE_DIR,
    stdio: "inherit"
  }
);
