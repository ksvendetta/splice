const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, 'attached_assets/image_1760814059676.png'),
  });

  // Start the Express server
  startServer();

  // Load the app after a short delay to ensure server is ready
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:5000');
  }, 2000);

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (serverProcess) {
      serverProcess.kill();
    }
  });
}

function startServer() {
  // Start the Node.js server
  const isDev = process.env.NODE_ENV === 'development';
  
  if (isDev) {
    // In development, use tsx to run TypeScript
    serverProcess = spawn('npx', ['tsx', 'server/index.ts'], {
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, NODE_ENV: 'production' }
    });
  } else {
    // In production, the server will be bundled or pre-built
    serverProcess = spawn('node', ['server/index.js'], {
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, NODE_ENV: 'production' }
    });
  }

  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err);
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
  if (serverProcess) {
    serverProcess.kill();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
