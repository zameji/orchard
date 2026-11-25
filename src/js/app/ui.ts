import { $, clamp } from '../util.js';
import { defaultCultivar, habitsFor } from '../sim/spec.js';
import { cultivarsFor } from '../sim/cultivars.js';
import { speciesList } from '../sim/species.js';
import { formList } from '../sim/systems.js';
import type {
  HabitId,
  PracticeMode,
  SpeciesId,
  TrainingSystem,
} from '../sim/axes.js';
import type { CapsKey, Rec } from '../sim/types.js';

export interface Config {
  species: SpeciesId;
  habit: HabitId;
  cultivar: string;
  form: TrainingSystem;
  practice: PracticeMode;
  start: number;
  seed: number;
  detail: CapsKey;
}

export interface HudView {
  year: string;
  habit: string;
  stats: string;
  undoEnabled: boolean;
  hint: string;
}

export interface PreviewView {
  title: string;
  score: string;
  why: string;
  parts: string[];
}

/** Events the DOM reports to the studio. */
export interface UiHooks {
  layout(): void;
  onPlant(): void;
  onReset(): void;
  onRandom(): void;
  onNext(): void;
  onUndo(): void;
  onCancel(): void;
  onConfirm(): void;
  onLeaves(): void;
  onFruit(): void;
  onHeat(): void;
  onRays(): void;
  onTime(value: string): void;
  onLearn(): void;
  onForm(form: TrainingSystem): void;
  onPractice(practice: PracticeMode): void;
  onPan(): void;
  onFit(): void;
  onTabSwitch(): void;
  onEscape(): void;
  onTap(ev: PointerEvent): void;
}

/** DOM bindings: owns the form, panels and input gestures. */
export class Ui {
  private hooks: UiHooks | null = null;
  private tab = '';
  private fallback = false;
  private noticeTimer?: ReturnType<typeof setTimeout>;
  private readonly pointers = new Set<number>();
  private tap: { id: number; x: number; y: number } | null = null;

  constructor() {
    const canvas = $('view') as HTMLCanvasElement;
    canvas.addEventListener(
      'pointerdown',
      (e: PointerEvent) => {
        this.pointers.add(e.pointerId);
        this.tap =
          this.pointers.size === 1 &&
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
          this.tap &&
          this.tap.id === e.pointerId &&
          Math.hypot(e.clientX - this.tap.x, e.clientY - this.tap.y) >
            (e.pointerType === 'mouse' ? 4 : 8)
        )
          this.tap = null;
      },
      true,
    );
    canvas.addEventListener(
      'pointerup',
      (e: PointerEvent) => {
        const ok =
          this.tap && this.tap.id === e.pointerId && this.pointers.size === 1;
        this.pointers.delete(e.pointerId);
        this.tap = null;
        if (ok && this.hooks) this.hooks.onTap(e);
      },
      true,
    );
    for (const type of ['pointercancel', 'lostpointercapture'] as const)
      canvas.addEventListener(
        type,
        (e: PointerEvent) => {
          this.pointers.delete(e.pointerId);
          this.tap = null;
        },
        true,
      );
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    document.querySelectorAll<HTMLElement>('[data-tab]').forEach(
      (b) =>
        (b.onclick = () => {
          this.hooks?.onTabSwitch();
          this.setTab(this.tab === b.dataset.tab ? '' : b.dataset.tab!);
        }),
    );
    for (let i = 1; i <= 15; i++)
      $('startYear').add(new Option('Year ' + i, String(i)));
    $('startYear').value = '5';
    $('detail').value = matchMedia('(pointer:coarse)').matches
      ? 'low'
      : 'medium';
    this.fillStaticSelects();
    $('species').onchange = () => this.fillSelectors();
    $('habit').onchange = () =>
      this.fillSelectors({ habit: $('habit').value as HabitId });
    this.fillSelectors();
    $('plant').onclick = () => this.hooks?.onPlant();
    $('reset').onclick = () => this.hooks?.onReset();
    $('random').onclick = () => this.hooks?.onRandom();
    $('next').onclick = () => this.hooks?.onNext();
    $('undo').onclick = () => this.hooks?.onUndo();
    $('cancel').onclick = () => this.hooks?.onCancel();
    $('confirm').onclick = () => this.hooks?.onConfirm();
    $('leaves').onclick = () => this.hooks?.onLeaves();
    $('fruit').onclick = () => this.hooks?.onFruit();
    $('heat').onclick = () => this.hooks?.onHeat();
    $('rays').onclick = () => this.hooks?.onRays();
    $('time').oninput = (e: Event) =>
      this.hooks?.onTime((e.target as HTMLInputElement).value);
    document
      .querySelectorAll<HTMLElement>('[data-time]')
      .forEach((b) => (b.onclick = () => this.hooks?.onTime(b.dataset.time!)));
    $('learn').onclick = () => this.hooks?.onLearn();
    $('form').onchange = (e: Event) =>
      this.hooks?.onForm((e.target as HTMLSelectElement).value as TrainingSystem);
    $('practice').onchange = (e: Event) =>
      this.hooks?.onPractice(
        (e.target as HTMLSelectElement).value as PracticeMode,
      );
    $('pan').onclick = () => this.hooks?.onPan();
    $('fit').onclick = () => this.hooks?.onFit();
    $('full').onclick = () => this.toggleFullscreen();
    document.addEventListener('fullscreenchange', () => this.fullLabel());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hooks?.onEscape();
        if (this.fallback) {
          this.fallback = false;
          $('app').classList.remove('expanded');
          this.fullLabel();
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
    for (const [id, on] of initState) this.pressed(id, on);
  }

  bind(hooks: UiHooks) {
    this.hooks = hooks;
  }

  notice(s: string, ms = 5000) {
    const box = $('notice');
    box.textContent = s;
    box.hidden = false;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => (box.hidden = true), ms);
  }

  hud(view: HudView) {
    $('year').textContent = view.year;
    $('habit').textContent = view.habit;
    $('stats').textContent = view.stats;
    $('undo').disabled = !view.undoEnabled;
    $('hint').textContent = view.hint;
  }

  pressed(id: string, on: boolean, label?: string) {
    $(id).setAttribute('aria-pressed', String(on));
    if (label) $(id).textContent = label;
  }

  closeTab() {
    this.setTab('');
  }

  hidePreview() {
    $('preview').hidden = true;
  }

  showPreview(view: PreviewView) {
    $('cutTitle').textContent = view.title;
    $('cutScore').textContent = view.score;
    $('why').textContent = view.why;
    $('parts').replaceChildren();
    for (const part of view.parts) {
      const s = document.createElement('span');
      s.textContent = part;
      $('parts').append(s);
    }
    $('preview').hidden = false;
  }

  guide(text: string) {
    $('systemNote').textContent = text;
  }

  renderRecs(recs: Rec[], learning: boolean, onPick: (r: Rec) => void) {
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
        b.onclick = () => onPick(r);
        el.append(b);
      });
    }
  }

  readConfig(): Config {
    return {
      species: $('species').value,
      habit: $('habit').value,
      cultivar: $('cultivar').value,
      form: $('form').value,
      practice: $('practice').value,
      start: clamp(+$('startYear').value, 1, 15),
      seed: Math.trunc(Number($('seed').value) || 0) >>> 0,
      detail: $('detail').value,
    };
  }

  writeConfig(c: Config) {
    $('species').value = c.species;
    this.fillSelectors({ habit: c.habit, cultivar: c.cultivar });
    $('startYear').value = c.start;
    $('seed').value = c.seed;
    $('detail').value = c.detail;
    $('form').value = c.form;
    $('practice').value = c.practice;
  }

  setSeed(seed: number) {
    $('seed').value = seed;
  }

  setSlider(hour: number) {
    $('time').value = hour;
  }

  /** Species and form lists come from the registries; habit/cultivar filter. */
  private fillStaticSelects() {
    const speciesSel = $('species');
    speciesSel.replaceChildren();
    for (const s of speciesList) speciesSel.add(new Option(s.label, s.id));
    const formSel = $('form');
    formSel.replaceChildren();
    for (const f of formList) formSel.add(new Option(f.label, f.id));
  }

  /** Rebuild habit and cultivar lists for the species; keep picks when asked. */
  private fillSelectors(pick?: { habit?: HabitId; cultivar?: string }) {
    const sp: SpeciesId = $('species').value;
    const hs = habitsFor(sp);
    const habitSel = $('habit');
    habitSel.replaceChildren();
    for (const h of hs) habitSel.add(new Option(h.label, h.id));
    const habitId: HabitId =
      pick?.habit && hs.some((h) => h.id === pick.habit)
        ? pick.habit
        : hs[0].id;
    habitSel.value = habitId;
    const cs = cultivarsFor(sp);
    const cultivarSel = $('cultivar');
    cultivarSel.replaceChildren();
    for (const c of cs) cultivarSel.add(new Option(c.label, c.id));
    cultivarSel.value =
      pick?.cultivar && cs.some((c) => c.id === pick.cultivar)
        ? pick.cultivar
        : defaultCultivar(sp, habitId).id;
  }

  private setTab(key: string) {
    this.tab = key;
    for (const b of document.querySelectorAll<HTMLElement>('[data-tab]')) {
      const on = b.dataset.tab === this.tab;
      $(b.dataset.tab!).hidden = !on;
      b.setAttribute('aria-expanded', String(on));
    }
    this.hooks?.layout();
  }

  private fullLabel() {
    this.pressed(
      'full',
      !!document.fullscreenElement || this.fallback,
      document.fullscreenElement || this.fallback ? 'Exit full' : 'Fullscreen',
    );
    this.hooks?.layout();
  }

  private async toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (this.fallback) {
        this.fallback = false;
        $('app').classList.remove('expanded');
        this.fullLabel();
        return;
      }
      if (!$('app').requestFullscreen) throw new Error('Unavailable');
      await $('app').requestFullscreen();
    } catch {
      this.fallback = true;
      $('app').classList.add('expanded');
      this.notice(
        'Viewport fill is active. This browser or frame restricts system fullscreen.',
      );
    }
    this.fullLabel();
  }
}
