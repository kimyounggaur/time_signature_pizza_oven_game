// Versioned, defensive local records. A failed browser storage operation keeps
// the current session usable without claiming that it was saved on the device.
import { capacity, bounds, defaultGroups, lengthIn, straddles, parseFill, keyOf } from './engine.js';
import { METERS, meterKey, menuKeys } from './orders.js';
import { DAYS } from './seeds.js';

export const SAVE_KEY = 'pzo_save_v1';
export const BACKUP_KEY = 'pzo_save_v1_backup';
const WARNING = '이 기기에서는 기록이 저장되지 않아요.';
let memoryRaw = null;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const strings = value => Array.isArray(value) ? [...new Set(value.filter(x => typeof x === 'string'))] : [];
const knownScenes = new Set(DAYS.flatMap(day => day.items.filter(item => item.states).map(item => item.id)));

export function freshSave() {
  return {
    version: 1,
    settings: { volume: 0.8, muted: false, slow: false, subs: true, motion: 'system', soundChecked: false, tips: [] },
    days: Object.fromEntries(DAYS.map(day => [day.id, { passed: false, runs: 0, best: 0 }])),
    menu: {}, shelf: {}, scenes: [], stats: { orders: 0, clean: 0, bakes: 0 }, active: null,
  };
}

// Parse only the six supported note tokens before asking the fraction engine to
// inspect a saved recipe. Invalid tokens never reach recursive fill functions.
const validRecipe = value => typeof value === 'string' && /^(?:1|2\.?|4\.?|8)(?: (?:1|2\.?|4\.?|8))*$/.test(value);
function cleanBooks(source, shelf = false) {
  const out = {};
  for (const meter of METERS) {
    const mk = meterKey(meter), B = bounds(meter, defaultGroups(meter)), canonical = new Set(menuKeys(meter));
    const keys = strings(record(source) ? source[mk] : []).filter(key => {
      if (!validRecipe(key)) return false;
      if (!shelf) return canonical.has(key);
      const fill = parseFill(key);
      return keyOf(fill) === key && lengthIn(capacity(meter), fill).state === 'exact' && straddles(fill, B).length > 0;
    });
    if (keys.length) out[mk] = keys;
  }
  return out;
}

function cleanActive(active) {
  if (!record(active)) return null;
  const day = DAYS.find(day => day.id === active.day);
  if (!day || !Array.isArray(active.queue) || !active.queue.length || active.queue.length > day.items.length * 2) return null;
  if (!Number.isInteger(active.idx) || active.idx < 0 || active.idx >= active.queue.length) return null;
  if (active.queue.some(entry => !record(entry) || !Number.isInteger(entry.i) || entry.i < 0 || entry.i >= day.items.length || typeof entry.redo !== 'boolean' || (entry.redo && (day.items[entry.i].states || day.items[entry.i].final)))) return null;
  const orderIds = new Set(day.items.filter(item => !item.states).map(item => item.id));
  const results = Array.isArray(active.results) ? active.results.filter(item => record(item) && orderIds.has(item.id) && ['full', 'half'].includes(item.recipe)).map(item => ({ id: item.id, text: typeof item.text === 'string' ? item.text : '', recipe: item.recipe, ...(['full', 'half'].includes(item.again) ? { again: item.again } : {}) })) : [];
  if (new Set(results.map(item => item.id)).size !== results.length) return null;
  return { day: day.id, queue: active.queue.map(({ i, redo }) => ({ i, redo })), idx: active.idx, results, last: validRecipe(active.last) ? active.last : null, fresh: count(active.fresh), freshShelf: count(active.freshShelf) };
}

export function normalizeSave(source) {
  const save = freshSave(), settings = record(source.settings) ? source.settings : {};
  if (typeof settings.volume === 'number' && Number.isFinite(settings.volume)) save.settings.volume = Math.min(1, Math.max(0, settings.volume));
  for (const key of ['muted', 'slow', 'subs', 'soundChecked']) if (typeof settings[key] === 'boolean') save.settings[key] = settings[key];
  if (['system', 'reduced', 'full'].includes(settings.motion)) save.settings.motion = settings.motion;
  save.settings.tips = strings(settings.tips);
  for (const day of DAYS) {
    const stored = record(source.days) && record(source.days[day.id]) ? source.days[day.id] : {};
    save.days[day.id] = { passed: stored.passed === true, runs: count(stored.runs), best: Math.min(count(stored.best), day.items.filter(item => !item.states).length) };
  }
  save.menu = cleanBooks(source.menu);
  save.shelf = cleanBooks(source.shelf, true);
  save.scenes = strings(source.scenes).filter(id => knownScenes.has(id));
  for (const key of ['orders', 'clean', 'bakes']) save.stats[key] = count(record(source.stats) ? source.stats[key] : undefined);
  save.active = cleanActive(source.active);
  return save;
}

function browserStorage(provided) {
  if (provided !== undefined) return provided;
  try { return globalThis.localStorage; } catch { return null; }
}

export function loadSave(provided) {
  const storage = browserStorage(provided);
  let raw = memoryRaw, persistent = !!storage;
  if (storage) {
    try { raw = storage.getItem(SAVE_KEY); } catch { persistent = false; }
  }
  if (raw == null) return { save: freshSave(), persistent, warning: persistent ? '' : WARNING };
  let source;
  try {
    source = JSON.parse(raw);
    if (!record(source) || source.version !== 1) throw new Error('unsupported save');
  } catch {
    if (storage && persistent) {
      try { storage.setItem(BACKUP_KEY, raw); } catch { persistent = false; }
    }
    return { save: freshSave(), persistent, warning: persistent ? '' : WARNING, recovered: true };
  }
  return { save: normalizeSave(source), persistent, warning: persistent ? '' : WARNING };
}

export function writeSave(save, provided) {
  const storage = browserStorage(provided);
  try { memoryRaw = JSON.stringify(save); } catch { return false; }
  if (!storage) return false;
  try { storage.setItem(SAVE_KEY, memoryRaw); return true; } catch { return false; }
}
