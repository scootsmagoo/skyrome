/**
 * Credits. Built-in entries plus every module's docs/credits/*.md, bundled at build time, so new
 * third-party assets show up here as soon as their module documents them.
 */
import { BaseModal } from '../Modal';
import type { UIManager } from '../UIManager';
import { h, keycap, type Child } from '../dom';
import { laurelRule } from '../motifs';

const files = import.meta.glob<string>('/docs/credits/*.md', { query: '?raw', import: 'default', eager: true });

/** Minimal Markdown → DOM (headings, bullets, paragraphs, links, **bold**, *italic*, `code`). */
export function renderMarkdown(md: string): HTMLElement {
  const out = h('div', { class: 'md' });
  let list: HTMLElement | null = null;
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.append(h('p', null, inline(para.join(' '))));
    para = [];
  };
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    const m = /^(#{1,3})\s+(.*)$/.exec(line);
    if (m) {
      flush();
      list = null;
      out.append(h(m[1].length === 1 ? 'h2' : m[1].length === 2 ? 'h3' : 'h4', null, inline(m[2])));
    } else if (/^\s*[-*]\s+/.test(line)) {
      flush();
      if (!list) out.append((list = h('ul')));
      list.append(h('li', null, inline(line.replace(/^\s*[-*]\s+/, ''))));
    } else if (!line.trim()) {
      flush();
      list = null;
    } else {
      list = null;
      para.push(line.trim());
    }
  }
  flush();
  return out;
}

function inline(text: string): Child[] {
  const out: Child[] = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|<(https?:[^>]+)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    // Links show their text only (the URL is in the tooltip and in the source file).
    if (m[1]) out.push(h('span', { class: 'md-link', title: m[2] }, m[1]));
    else if (m[3]) out.push(h('b', null, m[3]));
    else if (m[4]) out.push(h('em', null, m[4]));
    else if (m[5]) out.push(h('code', null, m[5]));
    else if (m[6]) out.push(h('span', { class: 'md-url' }, m[6]));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export class CreditsScreen extends BaseModal {
  readonly id = 'credits';
  private body = h('div', { class: 'credits-body sr-scroll' });

  constructor() {
    super('credits-screen');
  }

  override onOpen(ui: UIManager) {
    super.onOpen(ui);
    const rule = h('div', { class: 'credits-rule' });
    rule.innerHTML = laurelRule(240, 30);
    this.body.replaceChildren(
      h('div', { class: 'credits-hero' }, h('div', { class: 'logo' }, 'SKYROME'), h('div', { class: 'sub' }, 'Roma · A·D·CXIII'), rule),
      h(
        'section',
        { class: 'credits-sec' },
        h('h3', null, 'Made with'),
        h('ul', null, h('li', null, h('b', null, 'three.js'), ' — MIT License'), h('li', null, h('b', null, 'Rapier'), ' physics (Dimforge) — Apache 2.0'), h('li', null, h('b', null, 'Vite'), ' and ', h('b', null, 'TypeScript'))),
      ),
      ...Object.keys(files)
        .sort()
        .map((k) => h('section', { class: 'credits-sec' }, renderMarkdown(files[k]))),
      h('p', { class: 'credits-end' }, 'Ave atque vale.'),
    );
    this.el.replaceChildren(
      h('div', { class: 'sr-backdrop' }),
      h(
        'div',
        { class: 'screen-panel sr-panel credits-panel' },
        h('div', { class: 'screen-title' }, h('span', { class: 'en' }, 'Credits'), h('span', { class: 'la' }, 'Gratiae')),
        this.body,
        h('div', { class: 'sr-hints screen-hints' }, h('span', { class: 'sr-hint' }, keycap('↑↓'), 'Scroll'), h('span', { class: 'sr-hint', on: { click: () => this.close() } }, keycap('Esc'), 'Back')),
      ),
    );
  }

  onKey(e: KeyboardEvent) {
    const step = e.code === 'ArrowDown' ? 60 : e.code === 'ArrowUp' ? -60 : e.code === 'PageDown' || e.code === 'Space' ? 400 : e.code === 'PageUp' ? -400 : 0;
    if (!step) return false;
    this.body.scrollBy({ top: step, behavior: 'smooth' });
    return true;
  }
}
