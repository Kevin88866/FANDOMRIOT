// 桌面版入口：用 Electron 打开游戏页面（ES 模块需要通过自定义协议加载，不能直接 file://）
const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

app.whenReady().then(() => {
  const root = path.join(__dirname, '..');
  protocol.handle('app', req => {
    const p = decodeURIComponent(new URL(req.url).pathname);
    return net.fetch(pathToFileURL(path.join(root, p)).toString());
  });
  const win = new BrowserWindow({ width: 1600, height: 900, backgroundColor: '#05060a', autoHideMenuBar: true, title: '饭圈风云', webPreferences: { backgroundThrottling: false } });
  win.loadURL('app://game/index.html');
  win.webContents.on('before-input-event', (e, input) => { if (input.key === 'F11' && input.type === 'keyDown') win.setFullScreen(!win.isFullScreen()); });
});
app.on('window-all-closed', () => app.quit());
