/**
 * Who is speaking: moves the jaw of the person behind a spoken line (anim/face.ts does the moving).
 *
 *   installFaces(game)   once, after the UI (boot.ts)
 *
 * Lines reach the screen as subtitles (`ui:subtitle`: barks, guards, the director's lines, taunts), which
 * carry the speaker's name, and as dialogue views (`game.dialogue.onChange`), which carry the NPC's id.
 * A subtitle goes to the nearest person of that name within earshot of the player (the crowd's
 * generic names repeat, and the one who speaks is nearly always the nearest); a dialogue line to the NPC
 * of the conversation while it is theirs to speak, and the jaw rests when the player answers or leaves.
 */
import type { Game } from '../../../core/Game';
import type { Actor } from '../../Actor';
import { realBodyOf } from './RealBody';

/** How far (m) a subtitle's speaker may be from the player. */
const EARSHOT = 30;

export function installFaces(game: Game): void {
  const nameOf = (a: Actor) => (a as Actor & { name?: string }).name;
  game.events.on('ui:subtitle', ({ text, speaker }) => {
    const p = game.player?.position;
    if (!speaker || !p) return;
    const who = game.actors.near(p, EARSHOT, (a) => a !== (game.player as unknown) && nameOf(a) === speaker && !!realBodyOf(a.avatar))[0];
    realBodyOf(who?.avatar)?.speak(text);
  });
  // The dialogue system may come up after this: subscribe once it exists.
  let talking: Actor | null = null;
  let hooked = false;
  const hook = () => {
    const d = (game as Game & { dialogue?: { onChange(fn: (v: { npcId: string; speaker: string; text: string } | null) => void): () => void } }).dialogue;
    if (!d || hooked) return;
    hooked = true;
    d.onChange((v) => {
      const npc = v ? game.actors.get(v.npcId) ?? null : null;
      if (talking && talking !== npc) realBodyOf(talking.avatar)?.speak('');
      talking = npc;
      if (!npc) return;
      realBodyOf(npc.avatar)?.speak(v && v.speaker === 'npc' ? v.text : '');
    });
  };
  hook();
  if (!hooked)
    game.addSystem({
      name: 'faces',
      priority: 50,
      update() {
        hook();
      },
    });
}
