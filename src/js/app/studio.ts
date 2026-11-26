import * as THREE from 'three';
import { pct, signed } from '../util.js';
import { caps as allCaps } from '../sim/caps.js';
import { resolve, withForm } from '../sim/spec.js';
import type { PracticeMode, TrainingSystem, TreeSpec } from '../sim/axes.js';
import { Canopy } from '../sim/model.js';
import { Tree } from '../sim/tree.js';
import { CutPlanner, Grader, partNames } from '../sim/plan.js';
import type {
  Branch,
  Caps,
  CutPlan,
  Model,
  Rec,
  UndoEntry,
} from '../sim/types.js';
import { Advisor } from './advice.js';
import type { Stage } from '../render/scene.js';
import { type RenderCtx, type TreeMesh } from '../render/tree-mesh.js';
import { Picker } from '../render/picking.js';
import type { Config, Ui, UiHooks } from './ui.js';
import {
  loadSession,
  saveSession,
  type Prefs,
  type Session,
} from './persist.js';

export interface StudioDeps {
  tree: Tree;
  stage: Stage;
  treeMesh: TreeMesh;
  advisor: Advisor;
  ui: Ui;
}

/** Simulation owner and event root: the DI root wires this in main.ts. */
export class Studio implements UiHooks {
  private spec!: TreeSpec;
  private C: Caps = allCaps.low;
  private config!: Config;
  private tree: Tree;
  private advisor: Advisor;
  private m!: Model;
  private selected: CutPlan | null = null;
  private undoLog: UndoEntry[] = [];
  private recs: Rec[] = [];
  private showLeaves = true;
  private showFruit = true;
  private overlay = false;
  private guideSun = false;
  private learning = false;
  private panOnly = false;
  private practice: PracticeMode = 'normal';
  private renovationStart = 5;
  private hour = 12;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private readonly stage: Stage;
  private readonly treeMesh: TreeMesh;
  private readonly ui: Ui;
  private readonly picker: Picker;

  constructor(deps: StudioDeps) {
    this.tree = deps.tree;
    this.advisor = deps.advisor;
    this.stage = deps.stage;
    this.treeMesh = deps.treeMesh;
    this.ui = deps.ui;
    this.picker = new Picker(deps.stage, deps.treeMesh);
    deps.ui.bind(this.hooking());
  }

  boot() {
    window.addEventListener('pagehide', () => this.flush());
    const saved = loadSession();
    if (saved) this.restore(saved);
    else this.plant(this.ui.readConfig(), false);
  }

  /** Everything a reload needs to continue; derived state is rebuilt. */
  private session(): Session {
    return {
      config: this.config,
      tree: this.tree.snapshot(),
      undoLog: this.undoLog,
      renovationStart: this.renovationStart,
      prefs: {
        leaves: this.showLeaves,
        fruit: this.showFruit,
        overlay: this.overlay,
        guideSun: this.guideSun,
        learning: this.learning,
        panOnly: this.panOnly,
        hour: this.hour,
      },
    };
  }

  /** Trailing debounce so bursts of changes (slider drags) become one write. */
  private scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 300);
  }

  /** Write the session now; also the pagehide safety flush. */
  private flush() {
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    saveSession(this.session());
  }

  /**
   * Every user intent arrives through the UiHooks facade; wrap it once so
   * each intent schedules a save instead of per-mutation call sites that a
   * future mutator could forget.
   */
  private hooking(): UiHooks {
    return new Proxy(this, {
      get(target, key) {
        const fn = Reflect.get(target, key, target);
        return typeof fn === 'function'
          ? (...args: unknown[]) => {
              (fn as (...a: unknown[]) => unknown).apply(target, args);
              target.scheduleSave();
            }
          : fn;
      },
    }) as UiHooks;
  }

  /** Continue a persisted session exactly where it left off. */
  private restore(s: Session) {
    this.adopt(s.config, Tree.restore(s.tree), s.undoLog, s.renovationStart);
    this.applyPrefs(s.prefs);
    this.derive();
    this.scheduleSave();
  }

  /** Adopt config-derived state and a given tree; rebuild everything. */
  private adopt(
    c: Config,
    tree: Tree,
    undoLog: UndoEntry[],
    renovationStart: number,
  ) {
    this.selected = null;
    this.ui.hidePreview();
    this.undoLog = undoLog;
    this.config = { ...c };
    this.spec = resolve(c.species, c.habit, c.cultivar, c.form);
    this.practice = c.practice;
    this.C = allCaps[c.detail];
    this.tree = tree;
    this.renovationStart = renovationStart;
    this.advisor = new Advisor(this.spec, this.practice, this.renovationStart);
    this.ui.writeConfig(c);
  }

  /** Recompute the derived model and rebuild the whole display. */
  private derive() {
    this.m = new Canopy(this.tree, this.spec);
    this.treeMesh.resetGeometries(this.spec, this.C);
    this.stage.renderer.setPixelRatio(
      Math.min(devicePixelRatio || 1, this.C.dpr),
    );
    this.ui.closeTab();
    this.refresh();
    this.stage.viewport();
    this.stage.fitTree(this.m);
  }

  /** Reapply display toggles and solar time from a restored session. */
  private applyPrefs(p: Prefs) {
    this.showLeaves = p.leaves;
    this.showFruit = p.fruit;
    this.overlay = p.overlay;
    this.guideSun = p.guideSun;
    this.learning = p.learning;
    this.panOnly = p.panOnly;
    this.hour = p.hour;
    this.ui.setSlider(p.hour);
    this.ui.pressed('leaves', p.leaves);
    this.ui.pressed('fruit', p.fruit);
    this.ui.pressed('heat', p.overlay);
    this.ui.pressed('rays', p.guideSun);
    this.ui.pressed('learn', p.learning);
    this.ui.pressed('pan', p.panOnly);
    this.applyPan();
  }

  private applyPan() {
    this.stage.controls.touches.ONE = this.panOnly
      ? THREE.TOUCH.PAN
      : THREE.TOUCH.ROTATE;
    this.stage.controls.mouseButtons.LEFT = this.panOnly
      ? THREE.MOUSE.PAN
      : THREE.MOUSE.ROTATE;
  }

  private ctx(): RenderCtx {
    return {
      t: this.tree,
      m: this.m,
      spec: this.spec,
      caps: this.C,
      hour: this.hour,
      overlay: this.overlay,
      showLeaves: this.showLeaves,
      showFruit: this.showFruit,
      selected: this.selected,
    };
  }

  /** Rebuild mesh instances, then run the original rebuild tail. */
  private refresh() {
    this.treeMesh.rebuild(this.ctx());
    this.stage.updateSun(this.hour, this.guideSun, this.m);
    this.recommend();
    this.hud();
  }

  private redrawMarkers() {
    this.treeMesh.drawMarkers(this.recs, this.learning, this.selected, this.m);
  }

  private formatParts(pts: number[]) {
    return partNames.map((label, i) => label + ' ' + signed(pts[i]));
  }

  private hud() {
    this.ui.hud({
      year: 'Year ' + this.tree.year,
      habit:
        this.spec.species.label +
        ' · ' +
        this.spec.habit.label +
        ' · ' +
        this.spec.cultivar.label,
      stats: `${this.m.height.toFixed(1)} m · ${this.m.fruitCount} fruit · canopy ${this.m.score}/100 · pruned ${pct(this.m.removal)}`,
      undoEnabled: !!this.undoLog.length,
      hint: this.learning
        ? 'Mint rings · suggested collars'
        : 'Tap wood to inspect a cut',
    });
  }

  private plant(c: Config, announce = true) {
    const tree = new Tree(c.seed);
    tree.base = tree.edges[0].len;
    this.adopt(c, tree, [], c.start);
    for (let i = 1; i < c.start; i++)
      this.tree.advance(new Canopy(this.tree, this.spec), this.spec, this.C);
    this.derive();
    this.tree.base = this.m.live;
    if (announce)
      this.ui.notice(
        `Planted ${this.spec.species.label.toLowerCase()} · seed ${c.seed} · year ${this.tree.year}. ${this.spec.food}`,
      );
    this.scheduleSave();
  }

  private recommend() {
    this.recs = [];
    if (this.learning) {
      const pool = this.m.list
        .map((q) => this.advisor.recommend(q, this.m, this.tree))
        .filter((r): r is Rec => !!r)
        .sort((a, b) => b.weight - a.weight);
      for (const r of pool) {
        if (this.recs.every((k) => !Advisor.related(k.q, r.q)))
          this.recs.push(r);
        if (this.recs.length === 3) break;
      }
    }
    this.ui.guide(this.advisor.guide(this.tree.year));
    this.ui.renderRecs(this.recs, this.learning, (r) =>
      this.propose(r.q, 0, r.reason),
    );
    this.redrawMarkers();
  }

  propose(q: Branch | null, at: number, reason = '') {
    if (!q || !q.par) {
      this.ui.notice(
        'The rooted stem is protected. Select a scaffold or shoot.',
      );
      return;
    }
    this.ui.closeTab();
    const c = new CutPlanner(this.tree, this.spec).plan(q, at);
    c.grade = new Grader(this.tree, this.spec, this.practice).assess(
      q,
      c,
      this.m,
    );
    this.selected = c;
    this.treeMesh.paintWood(this.selected);
    this.redrawMarkers();
    this.ui.showPreview({
      title: at ? 'Heading · shorten shoot' : 'Thinning · branch collar',
      score: c.grade.score + '/100 cut',
      why:
        (reason
          ? reason + ' '
          : at
            ? this.spec.species.headingAdvice
            : 'A collar cut redirects growth to retained limbs. ') +
        `${pct(c.model.removal)} of live length removed this year if confirmed (guide ${pct(this.spec.species.budget)}). Canopy ${this.m.score} → ${c.model.score}.`,
      parts: this.formatParts(c.grade!.pts),
    });
    this.stage.viewport();
  }

  cancelCut() {
    if (!this.selected) return;
    this.selected = null;
    this.ui.hidePreview();
    this.treeMesh.paintWood(this.selected);
    this.redrawMarkers();
    this.stage.viewport();
  }

  confirmCut() {
    if (!this.selected) return;
    const c = this.selected;
    this.undoLog.push({
      removed: this.tree.removed,
      originals: c.originals,
      lost: c.lost,
    });
    this.tree.applyCut(c);
    this.m = c.model;
    this.selected = null;
    this.ui.hidePreview();
    this.refresh();
    this.stage.viewport();
    this.ui.notice(
      `Cut ${c.grade!.score}/100 · canopy ${signed(c.grade!.delta)} → ${this.m.score}. ` +
        this.formatParts(c.grade!.pts).join(' · '),
      7800,
    );
  }

  undoCut() {
    if (!this.undoLog.length) return;
    this.cancelCut();
    this.tree.undo(this.undoLog.pop()!);
    this.m = new Canopy(this.tree, this.spec);
    this.refresh();
    this.ui.notice(
      'Cut undone. The preceding wood, crop and canopy score are restored.',
    );
  }

  setTime(v: string | number) {
    this.hour = +v;
    this.ui.setSlider(this.hour);
    this.stage.updateSun(this.hour, this.guideSun, this.m);
    this.treeMesh.updateExposure(this.ctx());
  }

  layout() {
    this.stage.viewport();
  }

  onPlant() {
    this.plant(this.ui.readConfig());
  }

  onReset() {
    this.plant(this.config);
  }

  onRandom() {
    const v = new Uint32Array(1);
    if (typeof globalThis.crypto?.getRandomValues === 'function')
      crypto.getRandomValues(v);
    else v[0] = (Math.random() * 4294967296) >>> 0;
    this.ui.setSeed(v[0]);
    this.plant(this.ui.readConfig());
  }

  onNext() {
    this.cancelCut();
    this.ui.closeTab();
    const harvest = this.m,
      year = this.tree.year;
    const spr = this.tree.advance(this.m, this.spec, this.C);
    this.undoLog = [];
    this.m = new Canopy(this.tree, this.spec);
    this.refresh();
    this.stage.fitTree(this.m);
    const zone = this.spec.habit.yieldZoneLabel;
    this.ui.notice(
      `Y${year} harvest · ${harvest.fruitCount} fruit, ${harvest.kg.toFixed(1)} kg` +
        (harvest.fruitCount ? `, mean ${Math.round(harvest.diam)} mm.` : '.') +
        ` Y${this.tree.year} ${zone}: ${this.m.productive < 0.1 ? 'developing' : this.m.health > 0.62 ? 'well lit' : this.m.health > 0.45 ? 'mixed light' : 'shaded'}. ` +
        (spr
          ? `${spr} new watersprouts after pruning.`
          : 'No watersprout surge.') +
        (this.tree.edges.length >= this.C.max ? ' Segment cap reached.' : '') +
        (this.tree.stress > 0.4 ? ' Heavy crop reduced return bloom.' : ''),
      9500,
    );
  }

  onUndo() {
    this.undoCut();
  }

  onCancel() {
    this.cancelCut();
  }

  onConfirm() {
    this.confirmCut();
  }

  onLeaves() {
    this.showLeaves = !this.showLeaves;
    this.treeMesh.foliage!.visible = this.showLeaves;
    this.ui.pressed(
      'leaves',
      this.showLeaves,
      'Foliage: ' + (this.showLeaves ? 'On' : 'Off'),
    );
    this.stage.invalidate();
  }

  onFruit() {
    this.showFruit = !this.showFruit;
    this.treeMesh.fruitMesh!.visible = this.treeMesh.stems!.visible =
      this.showFruit;
    this.ui.pressed(
      'fruit',
      this.showFruit,
      'Fruit: ' + (this.showFruit ? 'On' : 'Off'),
    );
    this.stage.invalidate();
  }

  onHeat() {
    this.overlay = !this.overlay;
    this.ui.pressed('heat', this.overlay);
    this.treeMesh.updateExposure(this.ctx());
    this.stage.invalidate();
  }

  onRays() {
    this.guideSun = !this.guideSun;
    this.ui.pressed('rays', this.guideSun);
    this.stage.updateSun(this.hour, this.guideSun, this.m);
  }

  onTime(value: string) {
    this.setTime(value);
  }

  onLearn() {
    this.learning = !this.learning;
    this.ui.pressed(
      'learn',
      this.learning,
      'Learn mode: ' + (this.learning ? 'On' : 'Off'),
    );
    this.recommend();
    this.hud();
  }

  onForm(form: TrainingSystem) {
    this.spec = withForm(this.spec, form);
    this.config = { ...this.config, form };
    this.afterSpecChange();
  }

  onPractice(practice: PracticeMode) {
    this.practice = practice;
    if (practice === 'renovate') this.renovationStart = this.tree.year;
    this.config = { ...this.config, practice };
    this.afterSpecChange();
  }

  /** Rebuild the advisor and refresh guidance after a config change. */
  private afterSpecChange() {
    this.advisor = new Advisor(this.spec, this.practice, this.renovationStart);
    this.learning = true;
    this.ui.pressed('learn', true, 'Learn mode: On');
    this.recommend();
    this.hud();
  }

  onPan() {
    this.panOnly = !this.panOnly;
    this.applyPan();
    this.ui.pressed(
      'pan',
      this.panOnly,
      'One finger: ' + (this.panOnly ? 'Pan' : 'Orbit'),
    );
  }

  onFit() {
    this.stage.fitTree(this.m);
  }

  onTabSwitch() {
    this.cancelCut();
  }

  onEscape() {
    if (this.selected) this.cancelCut();
    else this.ui.closeTab();
  }

  onTap(ev: PointerEvent) {
    if (this.m)
      this.picker.pick(ev, {
        m: this.m,
        recs: this.recs,
        learning: this.learning,
        propose: (q, at, reason = '') => this.propose(q, at, reason),
      });
  }
}
