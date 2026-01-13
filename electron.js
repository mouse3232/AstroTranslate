
const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const open = require('open');

let serverProcess;

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    title: 'AI Translation & Correction',
    icon: path.join(__dirname, 'icon.png')
  });

  mainWindow.loadURL('http://localhost:3000');
}

function createInfoPanel() {
  const infoWindow = new BrowserWindow({
    width: 400,
    height: 200,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    title: 'Server Information',
    resizable: false,
    fullscreenable: false,
    alwaysOnTop: true
  });

  const content = `
    <body style="font-family: sans-serif; background-color: #f0f0f0; padding: 20px; text-align: center;">
      <h2 style="color: #333;">Server is Running</h2>
      <p style="color: #555;">The application is available at:</p>
      <a href="http://localhost:3000" id="app-url" style="color: #007bff; text-decoration: none;">http://localhost:3000</a>
    </body>
    <script>
      const open = require('open');
      document.getElementById('app-url').addEventListener('click', (e) => {
        e.preventDefault();
        open(e.target.href);
      });
    </script>
  `;

  infoWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(content)}`);
}

app.on('ready', () => {
  serverProcess = fork(path.join(__dirname, 'server.js'));

  serverProcess.on('message', (message) => {
    if (message === 'server-ready') {
      createMainWindow();
      createInfoPanel();
    }
  });

  serverProcess.on('error', (err) => {
    dialog.showErrorBox('Server Error', `An error occurred with the server: ${err.message}`);
    app.quit();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
