const fs = require('node:fs');
const path = require('node:path');
const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  session,
} = require('electron');

const APP_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(APP_ROOT, 'dist');

// Enable smooth audio playback & hardware WebGL inside Windows desktop shell
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

let mainWindow = null;

function ensureSingleInstanceLock() {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return false;
  }
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  return true;
}

function setupMainPermissions() {
  const allowedPermissions = new Set(['pointerLock', 'fullscreen']);
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowedPermissions.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return allowedPermissions.has(permission);
  });
}

function createMainWindow() {
  const iconPath = path.join(APP_ROOT, 'build', 'icon.ico');
  const win = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 960,
    minHeight: 540,
    fullscreen: true,
    autoHideMenuBar: true,
    backgroundColor: '#070b14',
    title: 'NEXUS ROYALE',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      webgl: true,
    },
  });

  win.setMenuBarVisibility(false);

  // Support F11 and Alt+Enter desktop fullscreen toggles
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });

  // Block untrusted external popups/navigations inside main game view
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (ev, url) => {
    if (!url.startsWith('file://')) {
      ev.preventDefault();
    }
  });

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  mainWindow = win;
  void win.loadFile(path.join(DIST_DIR, 'index.html'));
}

function registerIpcHandlers() {
  ipcMain.handle('nexus:toggleFullscreen', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    const next = !mainWindow.isFullScreen();
    mainWindow.setFullScreen(next);
    return next;
  });

  ipcMain.handle('nexus:setFullscreen', (_ev, fullscreen) => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    const target = Boolean(fullscreen);
    mainWindow.setFullScreen(target);
    return target;
  });

  ipcMain.handle('nexus:isFullscreen', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    return mainWindow.isFullScreen();
  });
}

if (ensureSingleInstanceLock()) {
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    setupMainPermissions();
    registerIpcHandlers();
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
