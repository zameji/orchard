import * as THREE from 'three';
import { $, clamp, pct, signed } from '../util.js';
import { caps as allCaps, budget, profiles } from '../sim/config.js';
import { Canopy } from '../sim/model.js';
import { Tree } from '../sim/tree.js';
import { CutPlanner, Grader, partNames } from '../sim/plan.js';
import type {
  Branch,
  Caps,
  CapsKey,
  CutPlan,
  Model,
  Profile,
  Rec,
  TrainingSystem,
  UndoEntry,
} from '../sim/types.js';
import { Advisor } from './advice.js';
import {
  controls,
  fitTree,
  invalidate,
  renderer,
  updateSun,
  viewport,
} from '../render/scene.js';
import {
  drawMarkers,
  foliage,
  fruitMesh,
  paintWood,
  rebuild,
  resetGeometries,
  stems,
  updateExposure,
  type RenderCtx,
} from '../render/tree-mesh.js';
import { pick } from '../render/picking.js';

interface Config {
  profile: number;
  start: number;
  seed: number;
  detail: CapsKey;
}

let P: Profile = profiles[0],
  C: Caps = allCaps.low,
  config: Config,
  T: Tree,
  M: Model,
  selected: CutPlan | null = null,
  undoLog: UndoEntry[] = [],
  recs: Rec[] = [];
let showLeaves = true,
  showFruit = true,
  overlay = false,
  guideSun = false,
  learning = false,
  panOnly = false;
let system: TrainingSystem = 'leader',
  renovationStart = 5,
  tab = '',
  hour = 12;

const ctx = (): RenderCtx => ({
  t: T,
  m: M,
  profile: P,
  caps: C,
  hour,
  overlay,
  showLeaves,
  showFruit,
  selected,
});

let noticeTimer: ReturnType<typeof setTimeout>;
/** Rebuild mesh instances, then run the original rebuild tail. */
function refresh() {
  rebuild(ctx());
  updateSun(hour, guideSun, M);
  recommend();
  hud();
}
function notice(s: string, ms = 5000) {
  const box = $('notice');
  box.textContent = s;
  box.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => (box.hidden = true), ms);
}
function hud() {
  $('year').textContent = 'Year ' + T.year;
  $('habit').textContent = P.sp + ' · ' + P.name;
  $('stats').textContent =
    `${M.height.toFixed(1)} m · ${M.fruitCount} fruit · canopy ${M.score}/100 · pruned ${pct(M.removal)}`;
  $('undo').disabled = !undoLog.length;
  $('hint').textContent = learning
    ? 'Mint rings · suggested collars'
    : 'Tap wood to inspect a cut';
}
function setTab(key: string) {
  tab = key;
  for (const b of document.querySelectorAll<HTMLElement>('[data-tab]')) {
    const on = b.dataset.tab === tab;
    $(b.dataset.tab!).hidden = !on;
    b.setAttribute('aria-expanded', String(on));
  }
  viewport();
}
function closeTab() {
  setTab('');
}
function pressed(id: string, on: boolean, label?: string) {
  $(id).setAttribute('aria-pressed', String(on));
  if (label) $(id).textContent = label;
}
function fillCultivars(index?: number) {
  const sel = $('cultivar');
  sel.replaceChildren();
  profiles.forEach((p, i) => {
    if (p.sp === $('species').value) sel.add(new Option(p.name, String(i)));
  });
  if (index !== undefined) sel.value = String(index);
}
function writeConfig(c: Config) {
  $('species').value = profiles[c.profile].sp;
  fillCultivars(c.profile);
  $('startYear').value = c.start;
  $('seed').value = c.seed;
  $('detail').value = c.detail;
}
function readConfig(): Config {
  return {
    profile: +$('cultivar').value,
    start: clamp(+$('startYear').value, 1, 15),
    seed: Math.trunc(Number($('seed').value) || 0) >>> 0,
    detail: $('detail').value,
  };
}
function plant(c: Config, announce = true) {
  selected = null;
  $('preview').hidden = true;
  undoLog = [];
  config = { ...c };
  P = profiles[c.profile];
  C = allCaps[c.detail];
  T = new Tree(c.seed);
  T.base = T.edges[0].len;
  system = P.sys;
  $('system').value = system;
  renovationStart = c.start;
  writeConfig(c);
  for (let i = 1; i < c.start; i++) T.advance(new Canopy(T, P), P, C);
  M = new Canopy(T, P);
  T.base = M.live;
  resetGeometries(P, C);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, C.dpr));
  closeTab();
  refresh();
  viewport();
  fitTree(M);
  if (announce)
    notice(
      `Planted ${P.sp.toLowerCase()} · seed ${c.seed} · year ${T.year}. ${P.food}`,
    );
}

function recommend() {
  const advisor = new Advisor(P, system, renovationStart);
  recs = [];
  if (learning) {
    const pool = M.list
      .map((q) => advisor.recommend(q, M, T))
      .filter((r): r is Rec => !!r)
      .sort((a, b) => b.weight - a.weight);
    for (const r of pool) {
      if (recs.every((k) => !Advisor.related(k.q, r.q))) recs.push(r);
      if (recs.length === 3) break;
    }
  }
  $('systemNote').textContent = advisor.guide(T.year);
  const el = $('recList');
  el.replaceChildren();
  if (learning) {
    if (!recs.length) {
      const tip = document.createElement('small');
      tip.textContent =
        'No priority thinning cuts within this year’s budget. Retaining wood is a valid choice.';
      el.append(tip);
    }
    recs.forEach((r, i) => {
      const b = document.createElement('button');
      b.textContent = `◎ ${i + 1} · ${r.reason}`;
      b.onclick = () => propose(r.q, 0, r.reason);
      el.append(b);
    });
  }
  drawMarkers(recs, learning, selected, M);
}

function propose(q: Branch | null, at: number, reason = '') {
  if (!q || !q.par) {
    notice('The rooted stem is protected. Select a scaffold or shoot.');
    return;
  }
  closeTab();
  const c = new CutPlanner(T, P).plan(q, at);
  c.grade = new Grader(T, P).assess(q, c, M, system);
  selected = c;
  paintWood(selected);
  drawMarkers(recs, learning, selected, M);
  $('cutTitle').textContent = at
    ? 'Heading · shorten shoot'
    : 'Thinning · branch collar';
  $('cutScore').textContent = c.grade.score + '/100 cut';
  $('why').textContent =
    (reason
      ? reason + ' '
      : at
        ? P.sp === 'Apple'
          ? 'Heading trades terminal growth for upright regrowth. '
          : 'Heading stone fruit costs renewal wood and provokes upright regrowth. '
        : 'A collar cut redirects growth to retained limbs. ') +
    `${pct(c.model.removal)} of live length removed this year if confirmed (guide ${pct(budget(P))}). Canopy ${M.score} → ${c.model.score}.`;
  const box = $('parts');
  box.replaceChildren();
  partNames.forEach((label, i) => {
    const s = document.createElement('span');
    s.textContent = label + ' ' + signed(c.grade!.pts[i]);
    box.append(s);
  });
  $('preview').hidden = false;
  viewport();
}
function cancelCut() {
  if (!selected) return;
  selected = null;
  $('preview').hidden = true;
  paintWood(selected);
  drawMarkers(recs, learning, selected, M);
  viewport();
}
function confirmCut() {
  if (!selected) return;
  const c = selected;
  undoLog.push({
    removed: T.removed,
    originals: c.originals,
    lost: c.lost,
  });
  T.applyCut(c);
  M = c.model;
  selected = null;
  $('preview').hidden = true;
  refresh();
  viewport();
  notice(
    `Cut ${c.grade!.score}/100 · canopy ${signed(c.grade!.delta)} → ${M.score}. ` +
      partNames.map((s, i) => s + ' ' + signed(c.grade!.pts[i])).join(' · '),
    7800,
  );
}
function undoCut() {
  if (!undoLog.length) return;
  cancelCut();
  T.undo(undoLog.pop()!);
  M = new Canopy(T, P);
  refresh();
  notice('Cut undone. The preceding wood, crop and canopy score are restored.');
}

const pointers = new Set<number>();
let tap: { id: number; x: number; y: number } | null = null;
const canvas = $('view') as HTMLCanvasElement;
canvas.addEventListener(
  'pointerdown',
  (e: PointerEvent) => {
    pointers.add(e.pointerId);
    tap =
      pointers.size === 1 &&
      e.button === 0 &&
      !e.shiftKey &&
      !e.ctrlKey &&
      !e.metaKey
        ? { id: e.pointerId, x: e.clientX, y: e.clientY }
        : null;
  },
  true,
);
canvas.addEventListener(
  'pointermove',
  (e: PointerEvent) => {
    if (
      tap &&
      tap.id === e.pointerId &&
      Math.hypot(e.clientX - tap.x, e.clientY - tap.y) >
        (e.pointerType === 'mouse' ? 4 : 8)
    )
      tap = null;
  },
  true,
);
canvas.addEventListener(
  'pointerup',
  (e: PointerEvent) => {
    const ok = tap && tap.id === e.pointerId && pointers.size === 1;
    pointers.delete(e.pointerId);
    tap = null;
    if (ok && M) pick(e, { m: M, recs, learning, propose });
  },
  true,
);
for (const type of ['pointercancel', 'lostpointercapture'] as const)
  canvas.addEventListener(
    type,
    (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      tap = null;
    },
    true,
  );
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

document.querySelectorAll<HTMLElement>('[data-tab]').forEach(
  (b) =>
    (b.onclick = () => {
      cancelCut();
      setTab(tab === b.dataset.tab ? '' : b.dataset.tab!);
    }),
);
for (let i = 1; i <= 15; i++)
  $('startYear').add(new Option('Year ' + i, String(i)));
$('startYear').value = '5';
$('detail').value = matchMedia('(pointer:coarse)').matches ? 'low' : 'medium';
$('species').onchange = () => fillCultivars();
fillCultivars(0);
$('plant').onclick = () => plant(readConfig());
$('reset').onclick = () => plant(config);
$('random').onclick = () => {
  const v = new Uint32Array(1);
  if (typeof globalThis.crypto?.getRandomValues === 'function')
    crypto.getRandomValues(v);
  else v[0] = (Math.random() * 4294967296) >>> 0;
  $('seed').value = v[0];
  plant(readConfig());
};
$('next').onclick = () => {
  cancelCut();
  closeTab();
  const harvest = M,
    year = T.year;
  const spr = T.advance(M, P, C);
  undoLog = [];
  M = new Canopy(T, P);
  refresh();
  fitTree(M);
  const zone =
    P.mode === 'peach' || P.mode === 'tip' ? 'renewal wood' : 'fruiting zones';
  notice(
    `Y${year} harvest · ${harvest.fruitCount} fruit, ${harvest.kg.toFixed(1)} kg` +
      (harvest.fruitCount ? `, mean ${Math.round(harvest.diam)} mm.` : '.') +
      ` Y${T.year} ${zone}: ${M.productive < 0.1 ? 'developing' : M.health > 0.62 ? 'well lit' : M.health > 0.45 ? 'mixed light' : 'shaded'}. ` +
      (spr
        ? `${spr} new watersprouts after pruning.`
        : 'No watersprout surge.') +
      (T.edges.length >= C.max ? ' Segment cap reached.' : '') +
      (T.stress > 0.4 ? ' Heavy crop reduced return bloom.' : ''),
    9500,
  );
};
$('undo').onclick = undoCut;
$('cancel').onclick = cancelCut;
$('confirm').onclick = confirmCut;
$('leaves').onclick = () => {
  showLeaves = !showLeaves;
  foliage!.visible = showLeaves;
  pressed('leaves', showLeaves, 'Foliage: ' + (showLeaves ? 'On' : 'Off'));
  invalidate();
};
$('fruit').onclick = () => {
  showFruit = !showFruit;
  fruitMesh!.visible = stems!.visible = showFruit;
  pressed('fruit', showFruit, 'Fruit: ' + (showFruit ? 'On' : 'Off'));
  invalidate();
};
$('heat').onclick = () => {
  overlay = !overlay;
  pressed('heat', overlay);
  updateExposure(ctx());
  invalidate();
};
$('rays').onclick = () => {
  guideSun = !guideSun;
  pressed('rays', guideSun);
  updateSun(hour, guideSun, M);
};
function setTime(v: string | number) {
  hour = +v;
  $('time').value = hour;
  updateSun(hour, guideSun, M);
  updateExposure(ctx());
}
$('time').oninput = (e: Event) => setTime((e.target as HTMLInputElement).value);
document
  .querySelectorAll<HTMLElement>('[data-time]')
  .forEach((b) => (b.onclick = () => setTime(b.dataset.time!)));
$('learn').onclick = () => {
  learning = !learning;
  pressed('learn', learning, 'Learn mode: ' + (learning ? 'On' : 'Off'));
  recommend();
  hud();
};
$('system').onchange = (e: Event) => {
  system = (e.target as HTMLSelectElement).value as TrainingSystem;
  if (system === 'renovate') renovationStart = T.year;
  learning = true;
  pressed('learn', true, 'Learn mode: On');
  recommend();
  hud();
};
$('pan').onclick = () => {
  panOnly = !panOnly;
  controls.touches.ONE = panOnly ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
  controls.mouseButtons.LEFT = panOnly ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  pressed('pan', panOnly, 'One finger: ' + (panOnly ? 'Pan' : 'Orbit'));
};
$('fit').onclick = () => fitTree(M);
let fallback = false;
function fullLabel() {
  pressed(
    'full',
    !!document.fullscreenElement || fallback,
    document.fullscreenElement || fallback ? 'Exit full' : 'Fullscreen',
  );
  viewport();
}
$('full').onclick = async () => {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    if (fallback) {
      fallback = false;
      $('app').classList.remove('expanded');
      fullLabel();
      return;
    }
    if (!$('app').requestFullscreen) throw new Error('Unavailable');
    await $('app').requestFullscreen();
  } catch {
    fallback = true;
    $('app').classList.add('expanded');
    notice(
      'Viewport fill is active. This browser or frame restricts system fullscreen.',
    );
  }
  fullLabel();
};
document.addEventListener('fullscreenchange', fullLabel);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (selected) cancelCut();
    else closeTab();
    if (fallback) {
      fallback = false;
      $('app').classList.remove('expanded');
      fullLabel();
    }
  }
});
const initState: [string, boolean][] = [
  ['leaves', true],
  ['fruit', true],
  ['learn', false],
  ['rays', false],
  ['heat', false],
  ['pan', false],
];
for (const [id, on] of initState) pressed(id, on);

export function boot() {
  plant(readConfig(), false);
}
