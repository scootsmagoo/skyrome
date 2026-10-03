/**
 * Loading screen: SPQR crest, a bronze progress bar on a meander band, and rotating Latin
 * quotations and tips. Works before the Game exists (only needs a parent element).
 */
import { DEFAULT_BINDINGS, type Bindings } from '../../core/Input';
import { h, setText } from '../dom';
import { meanderDataUri, spqrCrest } from '../motifs';
import { installTextures } from '../textures';
import { QUOTES, tips } from './lore';
import '../ui-base.css';
import './screens.css';

export interface LoadingHandle {
  readonly el: HTMLElement;
  /** 0..1 and an optional label ('Raising the Forum…'). */
  progress(p: number, label?: string): void;
  /** Fill the bar, fade out and remove. */
  done(): Promise<void>;
}

export interface LoadingOptions {
  title?: string;
  bindings?: Bindings;
  /** Seconds between tips (default 7). */
  rotate?: number;
}

export function showLoading(parent: HTMLElement, opts: LoadingOptions = {}): LoadingHandle {
  void installTextures();
  const crest = h('div', { class: 'ld-crest' });
  crest.innerHTML = spqrCrest(150);
  const fill = h('i', { class: 'fill' });
  const label = h('div', { class: 'ld-label' }, 'Preparing the city…');
  const pct = h('div', { class: 'ld-pct sr-num' }, '0%');
  const quoteLa = h('div', { class: 'la' });
  const quoteEn = h('div', { class: 'en' });
  const quoteSrc = h('div', { class: 'src' });
  const tipEl = h('div', { class: 'ld-tip' });
  const quoteBox = h('div', { class: 'ld-quote' }, quoteLa, quoteEn, quoteSrc);
  const band = h('div', { class: 'ld-band' });
  band.style.backgroundImage = meanderDataUri('rgba(214,176,98,0.55)', 18, 1.5);
  const el = h(
    'div',
    { class: 'sr-ui sr-loading' },
    h('div', { class: 'ld-bg' }),
    h('div', { class: 'ld-center' }, crest, h('div', { class: 'ld-logo' }, opts.title ?? 'SKYROME'), quoteBox),
    h('div', { class: 'ld-bottom' }, band, h('div', { class: 'ld-row' }, label, pct), h('div', { class: 'ld-bar' }, fill), tipEl),
  );
  parent.appendChild(el);

  const allTips = tips(opts.bindings ?? DEFAULT_BINDINGS);
  let qi = Math.floor(Math.random() * QUOTES.length);
  let ti = Math.floor(Math.random() * allTips.length);
  const show = () => {
    const q = QUOTES[qi % QUOTES.length];
    quoteLa.textContent = `“${q.latin}”`;
    quoteEn.textContent = q.english;
    quoteSrc.textContent = `— ${q.source}`;
    tipEl.textContent = allTips[ti % allTips.length];
    quoteBox.classList.remove('is-in');
    tipEl.classList.remove('is-in');
    void quoteBox.offsetWidth;
    quoteBox.classList.add('is-in');
    tipEl.classList.add('is-in');
  };
  show();
  const timer = window.setInterval(() => {
    qi++;
    ti++;
    show();
  }, (opts.rotate ?? 7) * 1000);

  let shown = 0;
  return {
    el,
    progress(p: number, text?: string) {
      shown = Math.max(shown, Math.min(1, p));
      fill.style.transform = `scaleX(${shown.toFixed(4)})`;
      setText(pct, `${Math.round(shown * 100)}%`);
      if (text) setText(label, text);
    },
    done() {
      this.progress(1);
      clearInterval(timer);
      return new Promise<void>((resolve) => {
        el.classList.add('is-leaving');
        setTimeout(() => {
          el.remove();
          resolve();
        }, 650);
      });
    },
  };
}
