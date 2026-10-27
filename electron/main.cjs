// 桌面版主进程：单实例、无菜单栏、全屏/窗口切换、存档写到用户数据目录、错误日志。
// 页面通过自定义协议 app:// 加载（ES 模块不能直接用 file://）。
const { app, BrowserWindow, protocol, net, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
if (!app.requestSingleInstanceLock()) app.quit();
Menu.setApplicationMenu(null);

const DEV = process.argv.includes('--dev') || !app.isPackaged;
const ROOT = path.join(__dirname, '..');
const USER = app.getPath('userData');
const SAVES = path.join(USER, 'saves'), LOGS = path.join(USER, 'logs'), WINCFG = path.join(USER, 'window.json');
for (const d of [SAVES, LOGS]) fs.mkdirSync(d, { recursive: true });
let win = null;

function log(msg) {
  try { fs.appendFileSync(path.join(LOGS, 'error.log'), `[${new Date().toISOString()}] ${msg}\n`); } catch { /* 日志写不了就算了 */ }
}
process.on('uncaughtException', e => log('main: ' + (e.stack || e)));

const readCfg = () => { try { return JSON.parse(fs.readFileSync(WINCFG, 'utf8')); } catch { return { display: 'fullscreen' }; } };
const writeCfg = c => { try { fs.writeFileSync(WINCFG, JSON.stringify(c)); } catch (e) { log('cfg: ' + e); } };
const slotFile = slot => (/^(auto|[1-3])$/.test(slot) ? path.join(SAVES, `slot_${slot}.json`) : null);

// ---------- 和页面通信（preload.cjs 里暴露成 window.native） ----------
ipcMain.on('save:read', (e, slot) => { const f = slotFile(slot); try { e.returnValue = f && fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null; } catch (err) { log('read: ' + err); e.returnValue = null; } });
ipcMain.on('save:write', (e, slot, data) => {
  const f = slotFile(slot);
  try { if (!f) throw new Error('bad slot'); fs.writeFileSync(f + '.tmp', data); fs.renameSync(f + '.tmp', f); e.returnValue = true; }   // 先写临时文件再改名，断电也不会写坏
  catch (err) { log('write: ' + err); e.returnValue = false; }
});
ipcMain.on('save:delete', (e, slot) => { const f = slotFile(slot); try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch (err) { log('delete: ' + err); } e.returnValue = true; });
ipcMain.on('app:version', e => { e.returnValue = app.getVersion(); });
ipcMain.on('app:quit', () => app.quit());
ipcMain.on('app:log', (e, msg) => log('renderer: ' + msg));
ipcMain.on('app:display', (e, mode) => {
  if (!win) return;
  win.setFullScreen(mode === 'fullscreen');
  writeCfg({ ...readCfg(), display: mode });
});

function createWindow() {
  const cfg = readCfg();
  win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1024, minHeight: 600,
    backgroundColor: '#05060a', title: '饭圈风云', icon: path.join(__dirname, 'icon.png'),
    fullscreen: cfg.display !== 'windowed', show: false, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), backgroundThrottling: false, devTools: DEV },
  });
  win.once('ready-to-show', () => win.show());
  win.loadURL('app://game/index.html');
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { const fs2 = !win.isFullScreen(); win.setFullScreen(fs2); writeCfg({ ...readCfg(), display: fs2 ? 'fullscreen' : 'windowed' }); e.preventDefault(); }
    if (DEV && input.key === 'F12') win.webContents.toggleDevTools();
  });
  win.webContents.on('render-process-gone', (e, d) => log('renderer gone: ' + JSON.stringify(d)));
  win.on('closed', () => { win = null; });
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  protocol.handle('app', req => {
    const p = decodeURIComponent(new URL(req.url).pathname);
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
});
app.on('window-all-closed', () => app.quit());
