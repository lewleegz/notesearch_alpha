const { app, BrowserWindow, Menu, shell, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs').promises;

// Import our custom modules
const SettingsManager = require('./settings');
const EmailManager = require('./email');
const AdBlocker = require('./adblocker');
const VPNManager = require('./vpn');
const VisitAnalytics = require('./analytics');

let mainWindow;
let notesData = [];
let settingsManager;
let emailManager;
let adBlocker;
let vpnManager;
let visitAnalytics;
const notesFilePath = path.join(__dirname, 'notes.json');

async function loadNotes() {
  try {
    const data = await fs.readFile(notesFilePath, 'utf8');
    notesData = JSON.parse(data);
  } catch (error) {
    // File doesn't exist or is corrupted, start with empty array
    notesData = [];
  }
}

async function saveNotes() {
  try {
    await fs.writeFile(notesFilePath, JSON.stringify(notesData, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to save notes:', error);
  }
}

function createWindow() {
  // Initialize managers
  settingsManager = new SettingsManager();
  emailManager = new EmailManager(settingsManager);
  adBlocker = new AdBlocker(settingsManager);
  vpnManager = new VPNManager(settingsManager);
  visitAnalytics = new VisitAnalytics(settingsManager);

  const bounds = settingsManager.get('windowBounds');
  const maximized = settingsManager.get('maximized');

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      webviewTag: true
    }
  });

  if (maximized) {
    mainWindow.maximize();
  }

  mainWindow.loadFile('src/index.html');

  // Save window state on resize/move
  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);
  mainWindow.on('maximize', () => settingsManager.set('maximized', true));
  mainWindow.on('unmaximize', () => settingsManager.set('maximized', false));

  // Load notes on startup
  loadNotes();

  // Auto-connect email and VPN if configured
  emailManager.autoConnect();
  vpnManager.autoConnect();

  // Set up session request filtering for ad blocker
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    const shouldBlock = adBlocker.shouldBlockRequest(details.url);
    callback({ cancel: shouldBlock });
  });

  // Handle window controls
  ipcMain.handle('minimize-window', () => mainWindow.minimize());
  ipcMain.handle('maximize-window', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  ipcMain.handle('close-window', () => mainWindow.close());

  // Handle notes with async/await
  ipcMain.handle('save-notes', async (event, data) => {
    notesData = data;
    await saveNotes();
    return true;
  });
  
  ipcMain.handle('get-notes', () => {
    return notesData;
  });

  // Handle external links
  ipcMain.handle('open-external', (event, url) => {
    shell.openExternal(url);
  });

  // Settings IPC handlers
  ipcMain.handle('get-settings', () => settingsManager.getAll());
  ipcMain.handle('set-setting', (event, key, value) => {
    settingsManager.set(key, value);
    return true;
  });
  ipcMain.handle('reset-settings', () => {
    settingsManager.reset();
    return true;
  });

  // Email IPC handlers
  ipcMain.handle('email-connect', async (event, config) => {
    try {
      return await emailManager.connect(config);
    } catch (error) {
      throw error;
    }
  });

  ipcMain.handle('email-disconnect', async () => {
    return await emailManager.disconnect();
  });

  ipcMain.handle('email-get-status', () => {
    return emailManager.getConnectionStatus();
  });

  ipcMain.handle('email-fetch', async (event, folder, limit) => {
    return await emailManager.fetchEmails(folder, limit);
  });

  ipcMain.handle('email-send', async (event, to, subject, body, attachments) => {
    try {
      return await emailManager.sendEmail(to, subject, body, attachments);
    } catch (error) {
      console.error('Email send IPC error:', error);
      throw error;
    }
  });

  ipcMain.handle('email-share-note', async (event, noteContent, noteTitle) => {
    try {
      return await emailManager.shareNoteViaEmail(noteContent, noteTitle);
    } catch (error) {
      console.error('Email share note IPC error:', error);
      throw error;
    }
  });

  ipcMain.handle('email-get-providers', () => {
    return settingsManager.getEmailProviders();
  });

  // Ad Blocker IPC handlers
  ipcMain.handle('adblocker-toggle', () => {
    return adBlocker.toggle();
  });

  ipcMain.handle('adblocker-get-stats', () => {
    return adBlocker.getStats();
  });

  ipcMain.handle('adblocker-update-filters', async () => {
    return await adBlocker.updateFilters();
  });

  // VPN IPC handlers
  ipcMain.handle('vpn-connect', async (event, serverId) => {
    return await vpnManager.connect(serverId);
  });

  ipcMain.handle('vpn-disconnect', async () => {
    return await vpnManager.disconnect();
  });

  ipcMain.handle('vpn-get-status', () => {
    return vpnManager.getStatus();
  });

  ipcMain.handle('vpn-get-location', async () => {
    return await vpnManager.getLocation();
  });

  // Extension IPC handlers
  ipcMain.handle('install-extension', async (event, extensionPath) => {
    try {
      const { BrowserWindow } = require('electron');
      await BrowserWindow.addExtension(extensionPath);
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to install extension: ${error.message}`);
    }
  });

  ipcMain.handle('get-extensions', () => {
    return settingsManager.getExtensions();
  });

  ipcMain.handle('remove-extension', async (event, extensionId) => {
    try {
      const { BrowserWindow } = require('electron');
      BrowserWindow.removeExtension(extensionId);
      settingsManager.removeExtension(extensionId);
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to remove extension: ${error.message}`);
    }
  });

  // Search engine handling
  ipcMain.handle('get-search-url', (event, query) => {
    return settingsManager.getSearchUrl(query);
  });

  // Theme handling
  ipcMain.handle('get-theme', () => {
    return settingsManager.getTheme();
  });

  // Webview content injection for ad blocking
  ipcMain.handle('get-content-blocking-script', () => {
    return adBlocker.getContentBlockingScript();
  });

  // Analytics IPC handlers
  ipcMain.handle('analytics-record-visit', (event, url, title, duration) => {
    return visitAnalytics.recordVisit(url, title, duration);
  });

  ipcMain.handle('analytics-get-most-visited', (event, limit) => {
    return visitAnalytics.getMostVisitedSites(limit || 10);
  });

  ipcMain.handle('analytics-get-recently-visited', (event, limit) => {
    return visitAnalytics.getRecentlyVisited(limit || 20);
  });

  ipcMain.handle('analytics-get-stats', () => {
    return visitAnalytics.getBrowsingStats();
  });

  ipcMain.handle('analytics-clear-old-visits', (event, days) => {
    return visitAnalytics.clearOldVisits(days || 90);
  });

  ipcMain.handle('analytics-export-data', () => {
    return visitAnalytics.exportData();
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Development tools (remove in production)
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

function saveWindowState() {
  if (!mainWindow.isMaximized()) {
    const bounds = mainWindow.getBounds();
    settingsManager.set('windowBounds', bounds);
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // End analytics session before closing
  if (visitAnalytics) {
    visitAnalytics.endSession();
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Remove default menu
Menu.setApplicationMenu(null);