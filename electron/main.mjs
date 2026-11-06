// NoteshAIre desktop app: one window over the local server, a tray icon that keeps listening when the window is closed,
// starts with the computer (hidden), updates itself from GitHub Releases when nothing is being recorded.
import { app, BrowserWindow, Tray, Menu, shell, nativeImage, Notification } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ICON = path.join(HERE, '..', 'build', 'icon.png'), TRAY = path.join(HERE, '..', 'build', 'tray.png');
let win = null, tray = null, srv = null, quitting = false, updateReady = null;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => show());

const startHidden = process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAsHidden;
const flagFile = () => path.join(app.getPath('userData'), 'app.json');
const flags = () => { try { return JSON.parse(fs.readFileSync(flagFile(), 'utf8')); } catch { return {}; } };
const setFlag = (k, v) => fs.writeFileSync(flagFile(), JSON.stringify({ ...flags(), [k]: v }));

function show() {
  if (!win) return createWindow();
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1000, height: 940, minWidth: 420, minHeight: 500, title: 'NoteshAIre', icon: ICON,
    backgroundColor: '#0e0f11', autoHideMenuBar: true, show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.loadURL(`http://127.0.0.1:${srv.port}/`);
  win.once('ready-to-show', () => { if (!startHidden || BrowserWindow.getAllWindows().length > 1) win.show(); });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  // closing the window keeps NoteshAIre listening in the tray
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault(); win.hide();
    if (!flags().toldTray && Notification.isSupported()) {
      new Notification({ title: 'NoteshAIre is still listening', body: 'It keeps recording from the tray. Quit it from the tray icon.', icon: ICON }).show();
      setFlag('toldTray', true);
    }
  });
}

function trayMenu() {
  const login = app.getLoginItemSettings().openAtLogin;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open NoteshAIre', click: show },
    { type: 'separator' },
    { label: 'Start with this computer', type: 'checkbox', checked: login, click: (i) => { app.setLoginItemSettings({ openAtLogin: i.checked, openAsHidden: true, args: ['--hidden'] }); } },
    ...(updateReady ? [{ label: `Restart to update (${updateReady})`, click: () => installUpdate() }] : []),
    ...(macNew ? [{ label: `Download version ${macNew}`, click: () => shell.openExternal(RELEASES) }] : []),
    { label: `Version ${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
}

// ---- updates: from GitHub Releases, installed when nothing is being played ----
let autoUpdater = null;
// unsigned Mac apps cannot replace themselves: on a Mac a new version shows as a link to the download page
const RELEASES = 'https://github.com/MatteoCaruso1/noteshaire/releases/latest';
let macNew = null;
async function macCheck() {
  try {
    const r = await fetch('https://api.github.com/repos/MatteoCaruso1/noteshaire/releases/latest', { headers: { 'User-Agent': 'NoteshAIre' } });
    if (!r.ok) return;
    const v = String((await r.json()).tag_name || '').replace(/^v/, '');
    const newer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
    if (v && newer(v, app.getVersion()) && macNew !== v) {
      macNew = v; trayMenu();
      if (Notification.isSupported()) { const n = new Notification({ title: `NoteshAIre ${v} is out`, body: 'Click to download it.' }); n.on('click', () => shell.openExternal(RELEASES)); n.show(); }
    }
  } catch {}
}
async function setupUpdates() {
  if (!app.isPackaged) return;
  // signed Mac builds update themselves like Windows; an unsigned one cannot, so it falls back to the download notice
  let macFallback = false;
  const fallback = () => { if (process.platform !== 'darwin' || macFallback) return; macFallback = true; macCheck(); setInterval(macCheck, 6 * 3600e3); };
  try { ({ autoUpdater } = (await import('electron-updater')).default); } catch { return; }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', (info) => { updateReady = info.version; trayMenu(); });
  autoUpdater.on('error', fallback);
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check(); setInterval(check, 6 * 3600e3);
  // a downloaded update installs itself after an hour with nothing played, while the window is closed
  setInterval(() => {
    if (!updateReady || (win && win.isVisible())) return;
    const st = srv.status();
    if (!st.recording && Date.now() - (st.lastPlayed || 0) > 3600e3) installUpdate();
  }, 10 * 60e3);
}
function installUpdate() { quitting = true; srv.close(); autoUpdater.quitAndInstall(true, true); }

app.whenReady().then(async () => {
  process.env.NOTESHAIRE_APP = '1';
  const { startServer, detectMode, defaultRoot } = await import('../src/server.mjs');
  const mode = detectMode();
  const root = mode === 'piano-studio' ? defaultRoot(mode) : path.join(app.getPath('userData'), 'data');
  srv = await startServer({ mode, root, port: 0 });
  // first run: start with the computer (the point is that recording never needs remembering)
  if (app.isPackaged && !flags().loginSet) { app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true, args: ['--hidden'] }); setFlag('loginSet', true); }
  tray = new Tray(nativeImage.createFromPath(TRAY));
  tray.setToolTip('NoteshAIre');
  tray.on('click', show);
  trayMenu();
  createWindow();
  setupUpdates();
});
app.on('window-all-closed', (e) => e.preventDefault?.()); // stays in the tray
app.on('activate', show); // macOS dock click
app.on('before-quit', () => { quitting = true; if (srv) srv.close(); });
