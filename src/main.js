import { Game } from './game.js';

const game = new Game();
window.game = game;   // 方便调试
game.boot().catch(e => {
  console.error(e);
  document.getElementById('ltext').textContent = '加载失败：' + e.message;
});
