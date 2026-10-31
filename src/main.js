import { Game } from './game.js';

// 全局错误界面：可以复制错误信息、继续或重新载入；桌面版同时写进日志文件
const shown = new Set();
function showError(msg, stack = '') {
  const text = `${msg}\n${stack || ''}`.trim();
  try { window.native?.log?.(text); } catch { /* 写不了日志就算了 */ }
  if (shown.has(msg) || /ResizeObserver|Script error\.?$|Pointer ?Lock|pointer lock|play\(\) request/i.test(msg)) return;
  shown.add(msg);
  const box = document.getElementById('err'); if (!box) return;
  document.getElementById('err-msg').textContent = `${text}\n\n版本 1.0.0 · ${navigator.userAgent}`;
  box.classList.remove('hidden');
  document.getElementById('err-copy').onclick = () => { navigator.clipboard?.writeText(document.getElementById('err-msg').textContent); document.getElementById('err-copy').textContent = '已复制'; };
  document.getElementById('err-go').onclick = () => box.classList.add('hidden');
  document.getElementById('err-reload').onclick = () => location.reload();
}
addEventListener('error', e => showError(e.message || String(e.error), e.error?.stack));
addEventListener('unhandledrejection', e => showError('未处理的异常：' + (e.reason?.message || e.reason), e.reason?.stack));

const game = new Game();
window.game = game;   // 方便调试
game.boot().catch(e => {
  console.error(e);
  document.getElementById('ltext').textContent = '加载失败：' + e.message;
  showError('加载失败：' + e.message, e.stack);
});
