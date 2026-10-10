/**
 * The life console commands (docs/modules/life.md): registered by installLife through
 * dev/console/commands.ts registerCommands.
 *
 *   life                       keepers open and shut, things, interactables, rumours today, problems
 *   life keepers               every keeper: open, shut ("opens at …") or dead
 *   life goto <id>             stand in front of a keeper's post or a thing (fuzzy: "life goto vinarius")
 *   life open <id>             what E does on a thing (opens its card)
 *   life rumours [where]       today's picks: a board id, a district id, talk, cry or notice
 *   job start <id>             start a job (a repeatable quest: job-portus-saccarius …)
 */
import * as THREE from 'three';
import type { ConsoleCtx } from '../dev/console/commands';
import { fuzzyFind, type CommandDef } from '../dev/console/parse';
import { findSafeGround } from '../world/safeGround';
import { BOARDS } from './registry';
import type { RumourDef } from './types';

export function lifeCommands(): CommandDef<ConsoleCtx>[] {
  return [
    {
      name: 'life',
      usage: '[keepers|goto|open|rumours] [id]',
      help: 'The life of the city: life goto <keeper or thing>, life open <thing>, life rumours [board]',
      run: async ([sub, ...rest], { game }) => {
        const life = game.life;
        if (!life) return 'No life module in this build.';
        const arg = rest.join(' ');
        const keeperIds = life.data.keepers.map((k) => k.id);
        const thingIds = life.data.activities.map((a) => a.id);
        const nameOf = (id: string) => life.keeper(id)?.name ?? life.data.activities.find((a) => a.id === id)?.name;
        switch ((sub ?? '').toLowerCase()) {
          case '': {
            const s = life.status();
            return [
              `Keepers ${s.keepers} (${s.open} open) · things ${s.activities} · interactables here ${s.interactables} · rumours today ${s.rumoursToday}`,
              ...(s.problems.length ? [`${s.problems.length} problems:`, ...s.problems.slice(0, 12).map((p) => `  ${p}`)] : ['No problems.']),
            ];
          }
          case 'keepers':
            return life.data.keepers.map((k) => `  ${k.id.padEnd(32)} ${life.dead(k.id) ? 'dead' : life.isOpen(k.id) ? 'open' : `shut, opens ${life.opensAt(k.id) ?? '?'}`}`);
          case 'goto': {
            const id = fuzzyFind(arg, [...keeperIds, ...thingIds], nameOf);
            if (!id) return `No keeper or thing like "${arg}". Try life keepers.`;
            const w = life.whereIs(id);
            if (!w) return `${id} has no place yet (its landmark or street isn't built).`;
            if (!game.flow) return 'No game flow.';
            const y = game.heightmap?.heightAt(w.stand.x, w.stand.z) ?? game.player?.position.y ?? 0;
            const want = new THREE.Vector3(w.stand.x, y, w.stand.z);
            const pos = findSafeGround(game, want, { maxRadius: 10, open: 1.2, openDirs: 3, maxAboveTerrain: 1.5 }) ?? want.setY(y + 0.1);
            await game.flow.spawnAt({ position: pos, heading: Math.atan2(w.look.x - pos.x, w.look.z - pos.z) });
            return `To ${nameOf(id) ?? id}.`;
          }
          case 'open': {
            const id = fuzzyFind(arg, thingIds, nameOf);
            if (!id) return `No thing like "${arg}".`;
            return life.open(id) ? `Opened ${id}.` : `${id} is shut, gated, or has nothing to do now.`;
          }
          case 'rumours':
          case 'rumors': {
            const show = (title: string, list: RumourDef[]) => [`${title}:`, ...(list.length ? list.map((r) => `  ${r.id}${r.hook ? ` [hook ${r.hook}]` : ''}  ${r.text.slice(0, 80)}${r.text.length > 80 ? '…' : ''}`) : ['  (none)'])];
            if (arg.startsWith('board-')) return show(arg, life.rumours({ board: arg }, 4));
            if (arg.startsWith('dist-')) return show(arg, life.rumours({ district: arg, kind: 'talk' }, 4));
            if (arg === 'talk' || arg === 'cry' || arg === 'notice') return show(arg, life.rumours({ kind: arg }, 6));
            const here = life.districtHere() ?? undefined;
            return [...show(`talk (${here ?? 'anywhere'})`, life.rumours({ district: here, kind: 'talk' }, 3)), ...show('cry', life.rumours({ kind: 'cry' }, 3)), ...BOARDS.flatMap((b) => show(b, life.rumours({ board: b }, 4)))];
          }
          default:
            return 'life [keepers | goto <id> | open <id> | rumours [board|district|talk|cry|notice]]';
        }
      },
    },
    {
      name: 'job',
      usage: 'start <id>',
      help: 'Start a job now (a repeatable quest: job start portus)',
      run: ([sub, id], { game }) => {
        const jobs = (game.quests?.all() ?? []).map((q) => q.id).filter((q) => q.startsWith('job-'));
        if (sub !== 'start') return jobs.length ? ['Jobs:', ...jobs.map((j) => `  ${j}`), 'job start <id> starts one.'] : 'No jobs in this build yet.';
        const job = fuzzyFind(id ?? '', jobs);
        if (!job) return `No job like "${id ?? ''}".`;
        return game.quests.start(job) ? `Started ${job}.` : `${job} is running already, or can't start now.`;
      },
    },
  ];
}
