// 存档：1 个自动存档 + 3 个手动存档位。
// 桌面版经 preload 写到用户数据目录（%APPDATA%/饭圈风云/saves），浏览器版退回 localStorage。
const native = window.native;
export const SLOTS = ['auto', '1', '2', '3'];
const key = slot => 'fr_slot_' + slot;

export function readSlot(slot) {
  try {
    const raw = native?.readSave ? native.readSave(slot) : localStorage.getItem(key(slot));
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && d.state ? d : null;
  } catch (e) { console.warn('读档失败', slot, e); return null; }
}

export function writeSlot(slot, state, meta) {
  const data = JSON.stringify({ v: 2, meta, state });
  try {
    if (native?.writeSave) native.writeSave(slot, data);
    else localStorage.setItem(key(slot), data);
    return true;
  } catch (e) {
    console.warn('存档失败', e);
    return false;
  }
}

export function deleteSlot(slot) {
  try { if (native?.deleteSave) native.deleteSave(slot); else localStorage.removeItem(key(slot)); } catch { /* 删不掉就算了 */ }
}

export function allSlots() { return SLOTS.map(slot => ({ slot, data: readSlot(slot) })); }

// 最近保存的存档（"继续游戏"用）
export function latestSlot() {
  let best = null;
  for (const { slot, data } of allSlots()) if (data && (!best || (data.meta?.savedAt || 0) > (best.data.meta?.savedAt || 0))) best = { slot, data };
  return best;
}

// 旧版单存档 → 自动存档位
export function migrateOldSave() {
  try {
    const old = localStorage.getItem('fr_save_v1');
    if (!old || readSlot('auto')) return;
    const s = JSON.parse(old);
    if (s && s.v === 1) writeSlot('auto', s, { season: s.season, week: s.week, fans: s.fans, money: s.money, handle: s.handle, fav: s.fav, playTime: 0, savedAt: Date.now() });
    localStorage.removeItem('fr_save_v1');
  } catch { /* 旧档坏了就不迁移 */ }
}
