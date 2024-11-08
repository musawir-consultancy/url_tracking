const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const tracker = require('./src/tracker');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'renderer.js'),
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile('index.html');
}

app.on('ready', createWindow);

ipcMain.on('start-tracking', (event) => {
  tracker.startTracking(mainWindow);
});

ipcMain.on('stop-tracking', () => {
  tracker.stopTracking();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});