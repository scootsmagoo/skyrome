/**
 * Developer sound board (DOM): every sound, loop and music state on a button, bus volumes,
 * time of day, HRTF, a spectrogram of the last sound, live status, and the offline verifier.
 * Used by the `audio` dev scene; any scene can mount it with `new SoundBoard(game, ui)`.
 */
import type { Game, System } from '../../core/Game';
import type { SettingsData } from '../../core/Settings';
import type { LoopHandle } from '../AudioEngine';
import { LOOPS, SOUNDS, bakeRate, getVariants } from '../bank';
import { MUSIC_STATES } from '../music/styles';
import type { MusicRequest } from '../music/MusicDirector';
import { drawSpectrogram } from './spectrogram';

const CSS = `
.sb { position:absolute; top:10px; right:10px; bottom:10px; width:400px; display:flex; flex-direction:column;
  background:rgba(20,14,10,0.84); border:1px solid rgba(217,179,90,0.4); border-radius:6px; color:var(--ink);
  font:13px/1.35 var(--font-body); box-shadow:0 8px 28px rgba(0,0,0,0.45); backdrop-filter:blur(6px); }
.sb.hidden { display:none; }
.sb header { padding:10px 12px 8px; border-bottom:1px solid rgba(217,179,90,0.25); }
.sb h1 { margin:0; font:600 15px/1.2 var(--font-display); letter-spacing:0.08em; color:var(--gold); }
.sb .hint { margin-top:4px; color:var(--ink-dim); font-size:12px; }
.sb .status { margin-top:6px; font:11px/1.4 ui-monospace,Menlo,monospace; color:#e9dcc0; white-space:pre-wrap; }
.sb .scroll { overflow-y:auto; padding:6px 12px 12px; flex:1; }
.sb details { border-bottom:1px solid rgba(217,179,90,0.14); padding:4px 0; }
.sb summary { cursor:pointer; font:600 12px/1.8 var(--font-display); letter-spacing:0.06em; color:#e8c97a; }
.sb .row { display:flex; flex-wrap:wrap; gap:4px; margin:4px 0 6px; }
.sb button { all:unset; cursor:pointer; padding:3px 7px; border-radius:3px; font:12px/1.3 var(--font-body);
  background:rgba(243,234,216,0.08); border:1px solid rgba(243,234,216,0.16); color:var(--ink); }
.sb button:hover { background:rgba(217,179,90,0.22); border-color:rgba(217,179,90,0.5); }
.sb button.on { background:rgba(143,42,31,0.75); border-color:#d9b35a; color:#fff3dc; }
.sb button.big { padding:6px 10px; font-weight:600; background:rgba(143,42,31,0.85); border-color:#d9b35a; }
.sb label.sl { display:grid; grid-template-columns:78px 1fr 34px; align-items:center; gap:6px; font-size:12px; color:var(--ink-dim); }
.sb input[type=range] { width:100%; accent-color:#d9b35a; }
.sb canvas { width:100%; height:150px; border-radius:3px; display:block; margin-top:4px; }
.sb pre { font:10px/1.35 ui-monospace,Menlo,monospace; white-space:pre; overflow-x:auto; background:rgba(0,0,0,0.35); padding:6px; border-radius:3px; max-height:320px; }
.sb .sub { font-size:11px; color:var(--ink-dim); margin:2px 0; }
.sb select { background:#2a201a; color:var(--ink); border:1px solid rgba(243,234,216,0.2); border-radius:3px; font:12px var(--font-body); }
.sb-unlock { position:absolute; left:50%; top:18%; transform:translateX(-50%); padding:10px 18px; font:600 15px var(--font-display);
  letter-spacing:0.08em; color:#fff3dc; background:rgba(143,42,31,0.9); border:1px solid #d9b35a; border-radius:4px; }
`;

type Where = 'here' | 'left' | 'right' | 'far';

export class SoundBoard implements System {
  readonly name = 'soundBoard';
  readonly priority = 1001;
  readonly el: HTMLDivElement;
  private status!: HTMLDivElement;
  private canvas!: HTMLCanvasElement;
  private statsLine!: HTMLDivElement;
  private report!: HTMLPreElement;
  private unlockEl: HTMLDivElement;
  private where: Where = 'here';
  private loops = new Map<string, LoopHandle>();
  private musicButtons = new Map<string, HTMLButtonElement>();
  private acc = 0;
  /** Extra status lines from the scene (surface underfoot, zone…). */
  extraStatus: () => string = () => '';

  constructor(
    private readonly game: Game,
    parent: HTMLElement,
  ) {
    if (!document.getElementById('sb-style')) {
      const st = document.createElement('style');
      st.id = 'sb-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.el = document.createElement('div');
    this.el.className = 'sb interactive';
    parent.appendChild(this.el);
    this.unlockEl = document.createElement('div');
    this.unlockEl.className = 'sb-unlock';
    this.unlockEl.textContent = 'Click or press any key to enable sound';
    parent.appendChild(this.unlockEl);
    this.build();
    // Buttons must not keep keyboard focus (Space would re-click them and also jump).
    this.el.addEventListener('pointerup', () => (document.activeElement as HTMLElement | null)?.blur?.());
  }

  toggle(show?: boolean) {
    const vis = show ?? this.el.classList.contains('hidden');
    this.el.classList.toggle('hidden', !vis);
  }

  get visible() {
    return !this.el.classList.contains('hidden');
  }

  private btn(parent: HTMLElement, label: string, onClick: (b: HTMLButtonElement) => void, title?: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.tabIndex = -1;
    if (title) b.title = title;
    b.addEventListener('click', (e) => {
      e.preventDefault();
      this.game.audio.unlock();
      onClick(b);
    });
    parent.appendChild(b);
    return b;
  }

  private section(title: string, open = false): HTMLDivElement {
    const d = document.createElement('details');
    d.open = open;
    const s = document.createElement('summary');
    s.textContent = title;
    d.appendChild(s);
    const body = document.createElement('div');
    d.appendChild(body);
    this.scrollEl.appendChild(d);
    return body;
  }

  private scrollEl!: HTMLDivElement;

  private build() {
    const head = document.createElement('header');
    head.innerHTML = `<h1>SKYROME · SOUND BOARD</h1><div class="hint">Click the world to look around · WASD walk · Shift run · C sneak · Space jump · F swing · Q block · E door · R draw · <b>Tab</b> hides this board</div>`;
    this.status = document.createElement('div');
    this.status.className = 'status';
    head.appendChild(this.status);
    this.el.appendChild(head);
    this.scrollEl = document.createElement('div');
    this.scrollEl.className = 'scroll';
    this.el.appendChild(this.scrollEl);

    // Music
    const mus = this.section('Music', true);
    const mrow = document.createElement('div');
    mrow.className = 'row';
    mus.appendChild(mrow);
    const states: MusicRequest[] = ['explore', ...MUSIC_STATES];
    for (const s of states) this.musicButtons.set(s, this.btn(mrow, s, () => this.game.audio.music.setState(s)));
    const mnote = document.createElement('div');
    mnote.className = 'sub';
    mnote.textContent = '"explore" follows the clock (day/night). Zones (temple) can override it.';
    mus.appendChild(mnote);

    // Mixer
    const mix = this.section('Mixer & time', true);
    const sliders: [keyof SettingsData, string][] = [
      ['masterVolume', 'master'],
      ['musicVolume', 'music'],
      ['sfxVolume', 'sfx'],
      ['ambienceVolume', 'ambience'],
      ['voiceVolume', 'voice'],
      ['uiVolume', 'ui'],
    ];
    for (const [key, label] of sliders) {
      const def = { ambienceVolume: 0.8, voiceVolume: 0.9, uiVolume: 0.75 } as Record<string, number>;
      const v = (this.game.settings.data[key] as number | undefined) ?? def[key] ?? 0.8;
      this.slider(mix, label, 0, 1, 0.01, v, (x) => this.game.settings.set(key, x as never));
    }
    this.slider(mix, 'hour', 0, 24, 0.25, this.game.time.hour, (h) => {
      const t = this.game.time;
      t.restore({ totalHours: t.dayIndex * 24 + h, timeScale: t.timeScale });
    }, (v) => `${Math.floor(v)}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}`);
    const mrow2 = document.createElement('div');
    mrow2.className = 'row';
    mix.appendChild(mrow2);
    const month = document.createElement('select');
    ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].forEach((m, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = m;
      month.appendChild(o);
    });
    month.value = String(this.game.time.date().month);
    month.title = 'Season (cicadas, crickets, swifts)';
    month.addEventListener('change', () => (this.game.audio.ambience.monthOverride = Number(month.value)));
    mrow2.appendChild(month);
    const hrtf = this.btn(mrow2, 'HRTF (headphones)', (b) => {
      const on = !this.game.settings.data.audioHrtf;
      this.game.settings.set('audioHrtf', on);
      b.classList.toggle('on', on);
    });
    hrtf.classList.toggle('on', !!this.game.settings.data.audioHrtf);
    this.btn(mrow2, 'time ×20 / ×0', (b) => {
      const t = this.game.time;
      t.timeScale = t.timeScale ? 0 : 20;
      b.classList.toggle('on', t.timeScale === 0);
    });

    // Where one-shots play
    const pos = this.section('One-shots play…', true);
    const prow = document.createElement('div');
    prow.className = 'row';
    pos.appendChild(prow);
    const wb: HTMLButtonElement[] = [];
    for (const [w, label] of [['here', 'here (2D)'], ['left', '4 m left'], ['right', '4 m right'], ['far', '25 m ahead']] as [Where, string][]) {
      const b = this.btn(prow, label, () => {
        this.where = w;
        wb.forEach((x) => x.classList.toggle('on', x === b));
      });
      if (w === this.where) b.classList.add('on');
      wb.push(b);
    }

    // Loops
    const lp = this.section('Ambience loops (2D at the listener)');
    const lrow = document.createElement('div');
    lrow.className = 'row';
    lp.appendChild(lrow);
    for (const l of LOOPS.values()) {
      this.btn(lrow, l.id, (b) => {
        const h = this.loops.get(l.id);
        if (h) {
          h.stop(1);
          this.loops.delete(l.id);
          b.classList.remove('on');
        } else {
          this.loops.set(l.id, this.game.audio.loop(l.id, { volume: 1 }));
          b.classList.add('on');
        }
      }, l.label);
    }
    const dir = document.createElement('div');
    dir.className = 'sub';
    dir.textContent = 'The ambience director also runs zones in the world: forum (crowd), garden (birds/insects), temple, hill (wind).';
    lp.appendChild(dir);
    this.btn(lp, 'director on/off', (b) => {
      const a = this.game.audio.ambience;
      a.enabled = !a.enabled;
      b.classList.toggle('on', !a.enabled);
    });

    // One-shots by group
    const groups = new Map<string, string[]>();
    for (const d of SOUNDS.values()) {
      if (d.kind !== 'oneshot') continue;
      const list = groups.get(d.group) ?? [];
      list.push(d.id);
      groups.set(d.group, list);
    }
    for (const [g, ids] of groups) {
      const body = this.section(`${g} (${ids.length})`, g === 'Combat');
      const row = document.createElement('div');
      row.className = 'row';
      body.appendChild(row);
      for (const id of ids) this.btn(row, SOUNDS.get(id)!.label, () => this.playOne(id), id);
    }

    // Spectrogram
    const sp = this.section('Spectrogram of the last sound', true);
    this.canvas = document.createElement('canvas');
    this.canvas.width = 376;
    this.canvas.height = 150;
    sp.appendChild(this.canvas);
    this.statsLine = document.createElement('div');
    this.statsLine.className = 'sub';
    sp.appendChild(this.statsLine);

    // Verification
    const ver = this.section('Offline verification', false);
    const vrow = document.createElement('div');
    vrow.className = 'row';
    ver.appendChild(vrow);
    this.report = document.createElement('pre');
    this.report.textContent = 'Renders every sound and 30 s of each music state through Web Audio offline and measures them.';
    this.btn(vrow, 'Run verification', async (b) => {
      b.textContent = 'Running…';
      const r = await this.game.audio.verify();
      this.report.textContent = r.table + '\n\nfailures: ' + (r.summary.failures.length ? r.summary.failures.join('\n') : 'none');
      b.textContent = 'Run verification';
    }).classList.add('big');
    ver.appendChild(this.report);
  }

  private slider(parent: HTMLElement, label: string, min: number, max: number, step: number, value: number, on: (v: number) => void, fmt = (v: number) => v.toFixed(2)) {
    const l = document.createElement('label');
    l.className = 'sl';
    const name = document.createElement('span');
    name.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.tabIndex = -1;
    const val = document.createElement('span');
    val.textContent = fmt(value);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      val.textContent = fmt(v);
      on(v);
    });
    input.addEventListener('change', () => input.blur());
    l.append(name, input, val);
    parent.appendChild(l);
  }

  /** Play a sound per the "where" setting and show its spectrogram. */
  playOne(id: string) {
    const a = this.game.audio;
    const cam = this.game.camera;
    let position: { x: number; y: number; z: number } | undefined;
    if (this.where !== 'here') {
      const fwd = { x: -Math.sin(cam.rotation.y), z: -Math.cos(cam.rotation.y) };
      const right = { x: -fwd.z, z: fwd.x };
      const L = a.listener;
      const d = this.where === 'far' ? 25 : 4;
      const dir = this.where === 'far' ? fwd : this.where === 'left' ? { x: -right.x, z: -right.z } : right;
      position = { x: L.x + dir.x * d, y: L.y, z: L.z + dir.z * d };
    }
    a.play(id, { position });
    const def = SOUNDS.get(id)!;
    const v = getVariants(id)!;
    const data = v[Math.floor(Math.random() * v.length)];
    drawSpectrogram(this.canvas, data, bakeRate(def), id);
    let peak = 0;
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      peak = Math.max(peak, Math.abs(data[i]));
      sum += data[i] * data[i];
    }
    this.statsLine.textContent = `${def.label} · ${(data.length / bakeRate(def)).toFixed(2)} s · peak ${(20 * Math.log10(peak)).toFixed(1)} dB · rms ${(10 * Math.log10(sum / data.length)).toFixed(1)} dB · mix ${def.gainDb ?? 0} dB · ${def.variants} variants · bus ${def.bus}`;
  }

  /** Show a bed or event's spectrogram without playing (used by tests/screenshots). */
  showSpectrogram(id: string, variant = 0) {
    const def = SOUNDS.get(id);
    if (!def) return;
    drawSpectrogram(this.canvas, getVariants(id)![variant], bakeRate(def), id);
  }

  lateUpdate(dt: number) {
    if (this.game.input.pressed('menu')) {
      this.toggle();
      if (this.visible) this.game.input.exitPointerLock();
    }
    this.acc += dt;
    if (this.acc < 0.25) return;
    this.acc = 0;
    const a = this.game.audio;
    const s = a.stats();
    this.unlockEl.style.display = s.state === 'running' ? 'none' : '';
    const np = a.music.nowPlaying;
    const lv = [...a.ambience.levels].filter(([, v]) => v > 0.01).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ');
    const m = a.meter();
    const t = this.game.time;
    const hh = Math.floor(t.hour);
    const mm = String(Math.floor((t.hour % 1) * 60)).padStart(2, '0');
    this.status.textContent =
      `audio ${s.state}${s.sampleRate ? ` · ${(s.sampleRate / 1000).toFixed(1)} kHz` : ''} · voices ${s.voices} · loops ${s.loopsAudible}/${s.loops} · baked ${s.bakedMB.toFixed(1)} MB + music ${s.musicMB.toFixed(1)} MB · reverb ${s.reverb}\n` +
      `music ${s.music}${np ? ` · ${np.info.mode} on ${np.info.final.toFixed(0)} Hz · ${np.info.tempo} ${np.info.meter === 6 ? '6/8' : `${np.info.meter}/4`} · ${np.info.melody ?? ''} · ${np.kind}${np.kind === 'phrase' ? ` ${np.info.phrase}` : ''}` : ''}\n` +
      (m ? `out peak ${m.peakDb.toFixed(1)} dB · rms ${m.rmsDb.toFixed(1)} dB · glue ${m.glueDb.toFixed(1)} · limiter ${m.limiterDb.toFixed(1)} dB\n` : '') +
      `${hh}:${mm} ${t.isNight ? 'night' : 'day'} · ${lv || 'no ambience'}` +
      (this.extraStatus() ? `\n${this.extraStatus()}` : '');
    for (const [st, b] of this.musicButtons) b.classList.toggle('on', a.music.requested === st);
  }
}
