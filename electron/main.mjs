import { app, BrowserWindow, dialog, nativeImage, screen, shell } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import net from 'node:net';

const productName = 'Dr. Claw';
const appId = 'io.openlair.drclaw';
const isMac = process.platform === 'darwin';
const isDev = !app.isPackaged;

app.setName(productName);
if (process.platform === 'win32') {
  app.setAppUserModelId(appId);
}
app.setPath('userData', path.join(app.getPath('appData'), productName));

let mainWindow = null;
let serverProcess = null;
let quitting = false;

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
  process.exit(0);
}

function getDesktopLogPath() {
  const baseDir = app.isReady()
    ? app.getPath('userData')
    : path.join(process.cwd(), '.electron-home', 'logs');

  return path.join(baseDir, 'desktop.log');
}

function logDesktop(message, details = null) {
  const line = `[${new Date().toISOString()}] ${message}${details ? ` ${typeof details === 'string' ? details : JSON.stringify(details)}` : ''}`;
  console.log(line);

  try {
    fs.mkdirSync(path.dirname(getDesktopLogPath()), { recursive: true });
    fs.appendFileSync(getDesktopLogPath(), `${line}\n`, 'utf8');
  } catch {
    // Ignore log write failures.
  }
}

process.on('uncaughtException', (error) => {
  logDesktop('uncaughtException', error instanceof Error ? {
    message: error.message,
    stack: error.stack,
  } : String(error));
});

process.on('unhandledRejection', (reason) => {
  logDesktop('unhandledRejection', reason instanceof Error ? {
    message: reason.message,
    stack: reason.stack,
  } : String(reason));
});

function resolveAppRoot() {
  return app.isPackaged ? process.resourcesPath : process.cwd();
}

function resolveNodeBinary() {
  if (!app.isPackaged && process.env.npm_node_execpath && fs.existsSync(process.env.npm_node_execpath)) {
    return process.env.npm_node_execpath;
  }

  if (process.env.NODE_BINARY && fs.existsSync(process.env.NODE_BINARY)) {
    return process.env.NODE_BINARY;
  }

  return process.execPath;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPortOpen(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });

    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.once('error', () => {
      resolve(false);
    });
  });
}

async function findAvailablePort(startPort, host) {
  for (let offset = 0; offset < 20; offset += 1) {
    const candidate = startPort + offset;
    const inUse = await isPortOpen(host, candidate);
    if (!inUse) {
      return candidate;
    }
  }

  throw new Error(`No free port available near ${startPort}`);
}

async function waitForServer(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok) {
        logDesktop('Server health check passed', { url });
        return;
      }
      lastError = new Error(`Unexpected health status ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await wait(500);
  }

  throw new Error(`Timed out waiting for local server at ${url}${lastError ? `: ${lastError.message}` : ''}`);
}

function resolveSharedDatabasePath() {
  const homeDir = app.getPath('home');
  const legacyDir = path.join(homeDir, '.vibelab');
  const legacyDbPath = path.join(legacyDir, 'auth.db');
  const legacySidecars = [`${legacyDbPath}-shm`, `${legacyDbPath}-wal`];

  const currentDir = path.join(homeDir, '.dr-claw');
  const currentDbPath = path.join(currentDir, 'auth.db');
  const currentSidecars = [`${currentDbPath}-shm`, `${currentDbPath}-wal`];

  if (fs.existsSync(currentDbPath)) {
    return currentDbPath;
  }

  if (!fs.existsSync(legacyDbPath)) {
    return currentDbPath;
  }

  try {
    fs.mkdirSync(currentDir, { recursive: true });
    fs.copyFileSync(legacyDbPath, currentDbPath);

    legacySidecars.forEach((legacySidecar, index) => {
      if (fs.existsSync(legacySidecar) && !fs.existsSync(currentSidecars[index])) {
        fs.copyFileSync(legacySidecar, currentSidecars[index]);
      }
    });

    return currentDbPath;
  } catch (error) {
    logDesktop('Failed to migrate legacy auth DB, using legacy path', error instanceof Error ? { message: error.message } : String(error));
    return legacyDbPath;
  }
}

function resolveSharedWorkspacesRoot() {
  const homeDir = app.getPath('home');
  const currentRoot = path.join(homeDir, 'dr-claw');
  const legacyRoot = path.join(homeDir, 'vibelab');

  if (fs.existsSync(currentRoot)) {
    return currentRoot;
  }

  if (fs.existsSync(legacyRoot)) {
    return legacyRoot;
  }

  return currentRoot;
}

function buildServerEnv(appRoot) {
  const userDataDir = app.getPath('userData');
  const runtimeDir = path.join(userDataDir, 'runtime');
  const databasePath = resolveSharedDatabasePath();
  const workspacesRoot = resolveSharedWorkspacesRoot();

  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.mkdirSync(workspacesRoot, { recursive: true });

  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    DR_CLAW_DESKTOP: '1',
    DATABASE_PATH: process.env.DATABASE_PATH || databasePath,
    DR_CLAW_RUNTIME_DIR: process.env.DR_CLAW_RUNTIME_DIR || runtimeDir,
    WORKSPACES_ROOT: process.env.WORKSPACES_ROOT || workspacesRoot,
    NODE_ENV: process.env.NODE_ENV || (isDev ? 'development' : 'production'),
    PORT: process.env.PORT || '3001',
    HOST: '127.0.0.1',
    VITE_PORT: process.env.VITE_PORT || '5173',
    APP_ROOT: appRoot,
  };
}

async function startServer() {
  const appRoot = resolveAppRoot();
  const env = buildServerEnv(appRoot);
  const requestedPort = Number.parseInt(env.PORT, 10) || 3001;
  const selectedPort = await findAvailablePort(requestedPort, env.HOST);
  env.PORT = String(selectedPort);
  const entrypoint = path.join(appRoot, 'server', 'index.js');
  const nodeBinary = resolveNodeBinary();

  logDesktop('Starting desktop server', {
    nodeBinary,
    entrypoint,
    port: env.PORT,
    host: env.HOST,
    appRoot,
    userData: app.getPath('userData'),
  });

  serverProcess = spawn(nodeBinary, [entrypoint], {
    cwd: appRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout?.on('data', (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);
    const trimmed = text.trim();
    if (trimmed) {
      logDesktop('server:stdout', trimmed);
    }
  });

  serverProcess.stderr?.on('data', (chunk) => {
    const text = chunk.toString();
    process.stderr.write(text);
    const trimmed = text.trim();
    if (trimmed) {
      logDesktop('server:stderr', trimmed);
    }
  });

  serverProcess.once('exit', (code, signal) => {
    serverProcess = null;
    logDesktop('Desktop server exited', { code, signal });

    if (!quitting) {
      dialog.showErrorBox(
        'Dr. Claw server exited',
        `The local server stopped unexpectedly${signal ? ` (${signal})` : ''}${typeof code === 'number' ? ` (exit code ${code})` : ''}.\n\nSee desktop.log in the app data directory for details.`,
      );
      app.quit();
    }
  });

  await waitForServer(`http://${env.HOST}:${env.PORT}/health`);

  return `http://${env.HOST}:${env.PORT}`;
}

function isWindowVisibleOnSomeDisplay(bounds) {
  return screen.getAllDisplays().some(({ workArea }) => {
    const overlapWidth = Math.max(
      0,
      Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x),
    );
    const overlapHeight = Math.max(
      0,
      Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y),
    );

    return overlapWidth >= 240 && overlapHeight >= 180;
  });
}

function ensureWindowVisible(window) {
  if (window.isDestroyed()) {
    return;
  }

  const bounds = window.getBounds();
  if (isWindowVisibleOnSomeDisplay(bounds)) {
    return;
  }

  const { workArea } = screen.getPrimaryDisplay();
  const width = Math.min(Math.max(bounds.width || 1440, 1100), Math.max(workArea.width - 48, 1100));
  const height = Math.min(Math.max(bounds.height || 960, 760), Math.max(workArea.height - 64, 760));

  window.setBounds({
    width,
    height,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
  });
}

function createWindow(baseUrl) {
  logDesktop('Creating BrowserWindow', { baseUrl });

  const iconPath = path.join(resolveAppRoot(), 'build', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 760,
    title: productName,
    show: false,
    center: true,
    backgroundColor: '#0b1220',
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.removeMenu();

  let revealed = false;
  const revealWindow = (reason) => {
    if (!mainWindow || mainWindow.isDestroyed() || revealed) {
      return;
    }

    revealed = true;
    ensureWindowVisible(mainWindow);
    mainWindow.show();
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.moveTop();
    mainWindow.focus();
    logDesktop('BrowserWindow revealed', { reason, bounds: mainWindow.getBounds() });
  };

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(baseUrl)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    logDesktop('BrowserWindow closed');
    mainWindow = null;
  });

  mainWindow.on('unresponsive', () => {
    logDesktop('BrowserWindow became unresponsive');
  });

  mainWindow.once('ready-to-show', () => {
    logDesktop('BrowserWindow ready-to-show');
    revealWindow('ready-to-show');
  });

  mainWindow.webContents.once('did-finish-load', () => {
    logDesktop('BrowserWindow did-finish-load');
    revealWindow('did-finish-load');
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    logDesktop('did-fail-load', { errorCode, errorDescription, validatedURL });
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logDesktop('render-process-gone', details);
  });

  mainWindow.loadURL(baseUrl);
  setTimeout(() => revealWindow('timeout'), 4000);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

async function boot() {
  try {
    const iconPath = path.join(resolveAppRoot(), 'build', 'icon.png');
    if (isMac && fs.existsSync(iconPath)) {
      const dockIcon = nativeImage.createFromPath(iconPath);
      if (!dockIcon.isEmpty()) {
        app.dock.setIcon(dockIcon);
      }
    }

    const baseUrl = await startServer();
    createWindow(baseUrl);
  } catch (error) {
    logDesktop('boot failed', error instanceof Error ? { message: error.message, stack: error.stack } : String(error));
    dialog.showErrorBox('Failed to start Dr. Claw', error instanceof Error ? error.message : String(error));
    app.quit();
  }
}

async function stopServer() {
  if (!serverProcess) {
    return;
  }

  const child = serverProcess;
  serverProcess = null;

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
    }, 5000);

    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });

    child.kill('SIGTERM');
  });
}

app.on('second-instance', () => {
  if (!mainWindow) {
    return;
  }

  ensureWindowVisible(mainWindow);
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
});

app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit();
  }
});

app.on('before-quit', () => {
  quitting = true;
});

app.on('will-quit', (event) => {
  if (!serverProcess) {
    return;
  }

  event.preventDefault();
  void stopServer().finally(() => {
    app.exit(0);
  });
});

app.on('activate', () => {
  if (!mainWindow) {
    void boot();
    return;
  }

  ensureWindowVisible(mainWindow);
  mainWindow.show();
  mainWindow.focus();
});

logDesktop('Electron main process starting', {
  pid: process.pid,
  isDev,
  platform: process.platform,
  cwd: process.cwd(),
  userData: app.getPath('userData'),
});

app.whenReady()
  .then(() => {
    void boot();
  })
  .catch((error) => {
    logDesktop('app.whenReady failed', error instanceof Error ? {
      message: error.message,
      stack: error.stack,
    } : String(error));
    dialog.showErrorBox('Failed to start Dr. Claw', error instanceof Error ? error.message : String(error));
    app.quit();
  });
