import { N, M, capacity, dur, div, num, lengthIn } from './engine.js';
import { DAYS } from './seeds.js';

// Rollback switch affects entry and replay only; existing learning records stay intact.
export const TASTER_ENABLED = true;
const copyFill = fill => fill.map(note => ({ ...note }));
const result = (state, effects = []) => ({ state, effects });

/** Separate from Game: no score, queue, clock, storage or audio is owned here. */
export function initialTaster() {
  return { phase: 'two', two: [], three: [], playing: false, token: 0, completed: false, exited: false };
}

function cancel(state) {
  return { ...state, phase: state.phase === 'playTwo' ? 'two' : state.phase, playing: false, token: state.token + 1 };
}

function enterThree(state) {
  return { ...state, phase: 'three', three: copyFill(state.two), playing: false, token: state.token + 1 };
}

/**
 * Events: ADD, UNDO, BAKE, END({token}), SKIP_TO_COMPARE, STOP,
 * OPEN_DIALOG, VISIBILITY_HIDDEN, EXIT({screen}), RESTART.
 * Effects are declarative: play, cancel, seen, exit. END must carry its play token.
 */
export function reduceTaster(state, input) {
  const event = typeof input === 'string' ? { type: input } : input;
  if (!event || typeof event.type !== 'string') return result(state);
  if (event.type === 'RESTART') {
    return result({ ...initialTaster(), token: state.token + 1, completed: state.completed }, [{ type: 'cancel' }]);
  }
  if (state.exited) return result(state);
  if (event.type === 'EXIT') {
    const effects = [{ type: 'cancel' }];
    if (!state.completed) effects.push({ type: 'seen' });
    effects.push({ type: 'exit', screen: event.screen === 'map' ? 'map' : 'title' });
    return result({ ...cancel(state), completed: true, exited: true }, effects);
  }
  if (['STOP', 'OPEN_DIALOG', 'VISIBILITY_HIDDEN'].includes(event.type)) {
    return result(cancel(state), [{ type: 'cancel' }]);
  }
  if (event.type === 'END') {
    if (!state.playing || event.token !== state.token) return result(state);
    return result(state.phase === 'playTwo' ? enterThree(state) : { ...state, playing: false, token: state.token + 1 });
  }
  if (event.type === 'SKIP_TO_COMPARE') {
    if ((state.phase !== 'two' && state.phase !== 'playTwo') || state.two.length !== 2) return result(state);
    return result(enterThree(state), [{ type: 'cancel' }]);
  }
  // A click still arriving during playback must not add or remove a piece.
  if (state.playing) return result(state);
  if (event.type === 'ADD') {
    if (state.phase === 'two' && state.two.length < 2) return result({ ...state, two: [...state.two, N(4)] });
    if (state.phase === 'three' && state.three.length < 3) {
      const three = [...state.three, N(4)];
      if (three.length === 3) return result({ ...state, three, phase: 'compare', completed: true }, state.completed ? [] : [{ type: 'seen' }]);
      return result({ ...state, three });
    }
    return result(state);
  }
  if (event.type === 'UNDO') {
    if (state.phase === 'two' && state.two.length) return result({ ...state, two: state.two.slice(0, -1) });
    if (['three', 'compare'].includes(state.phase) && state.three.length) return result({ ...state, phase: 'three', three: state.three.slice(0, -1) });
    return result(state);
  }
  if (event.type === 'BAKE') {
    const view = tasterView(state);
    if (!view.canBake) return result(state);
    const next = { ...state, playing: true, phase: state.phase === 'two' ? 'playTwo' : 'compare', token: state.token + 1 };
    return result(next, [{ type: 'play', token: next.token, meter: view.meter, fill: copyFill(view.fill) }]);
  }
  return result(state);
}

/** All amounts are derived from the exact same fractions used by regular orders. */
export function tasterView(state) {
  const isTwo = ['two', 'playTwo'].includes(state.phase), meter = M(isTwo ? 2 : 3, 4);
  const fill = isTwo ? state.two : state.three, length = lengthIn(capacity(meter), fill);
  const remaining = num(div(length.diff, dur(N(4)))), count = fill.length, slots = meter.num;
  const complete = state.phase === 'compare';
  const message = complete ? '같은 4분음표로 2박에서 3박이 됐어요.' : state.phase === 'playTwo' ? '첫 박, 둘째 박을 한 마디만 들어요.' : isTwo ? count === 0 ? '한 자리에 한 박. 빈자리를 채워요.' : count === 1 ? '한 박 놓았어요. 1박 남았어요.' : '2박, 꽉 찼어요.' : count === 2 ? '같은 조각을 하나 더 올려 볼까요?' : `한 자리에 한 박. ${remaining}박 남았어요.`;
  return {
    phase: state.phase, meter, fill: copyFill(fill), count, slots, remaining,
    twoFill: copyFill(state.two), threeFill: copyFill(state.three),
    playing: state.playing, complete,
    canAdd: !state.playing && !state.exited && !complete && length.state === 'short',
    canUndo: !state.playing && !state.exited && count > 0,
    canBake: !state.playing && !state.exited && (state.phase === 'two' || complete) && length.state === 'exact',
    title: complete ? '같은 조각, 한 박 더!' : isTwo ? '두 박 피자를 만들어요' : '세 박 피자로 바꿔요',
    message,
    summary: `4분의 ${meter.num}박자, ${slots}자리 중 ${count}자리 채움`,
  };
}

function validActive(active) {
  if (!active || typeof active !== 'object') return false;
  const day = DAYS.find(day => day.id === active.day);
  if (!day || !Array.isArray(active.queue) || !active.queue.length || active.queue.length > day.items.length * 2 || !Number.isInteger(active.idx) || active.idx < 0 || active.idx >= active.queue.length) return false;
  return active.queue.every(entry => entry && Number.isInteger(entry.i) && entry.i >= 0 && entry.i < day.items.length && typeof entry.redo === 'boolean' && (!entry.redo || (!day.items[entry.i].states && !day.items[entry.i].final)));
}

export function hasLearningHistory(save) {
  if (!save || typeof save !== 'object') return false;
  const settings = save.settings || {};
  if (validActive(save.active) || settings.tasterSeenV1 === true || settings.soundChecked === true || (Array.isArray(settings.tips) && settings.tips.some(tip => typeof tip === 'string' && tip.length))) return true;
  if (DAYS.some(day => { const record = save.days?.[day.id]; return record && (record.passed === true || record.runs > 0 || record.best > 0); })) return true;
  if (['orders', 'clean', 'bakes'].some(key => save.stats?.[key] > 0)) return true;
  if (Array.isArray(save.scenes) && save.scenes.length) return true;
  return ['menu', 'shelf'].some(key => save[key] && typeof save[key] === 'object' && Object.values(save[key]).some(list => Array.isArray(list) && list.length));
}

/** Called once at boot, never as a render-time redirect. save should be normalized. */
export function resolveLanding(hash, save, { enabled = TASTER_ENABLED } = {}) {
  if (hash === '#test') return { screen: 'test' };
  if (/^#d[0-4]$/.test(hash)) return { screen: 'shift', day: hash.slice(1) };
  return { screen: !enabled || hasLearningHistory(save) ? 'title' : 'taster' };
}
