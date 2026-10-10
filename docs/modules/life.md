# Life module: shops, services, things, rumours (phase 2)

The life of the city: named shopkeepers who stand at the stations and sell, services you pay for
(the baths, a haircut, a letter), things you press E on (a fountain, a notice board, a bed), the
rumours of the day, and the hooks the other phase-2 crews plug into (the mortar, the dice, jobs).
The plan is `docs/design/world-life.md`; `docs/STORY.md` wins over both.

- Code: `src/life/` — `types.ts` (the contracts), `registry.ts` (LIFE, `validateLife`, the history
  lint), `install.ts` (`installLife`, `game.life`, the save), `gates.ts`, `effects.ts`, `keepers.ts`,
  `cards.ts`, `talk.ts` (`lifeChoices`, `registerBench` / `registerWager` / `registerJob`),
  `rumours.ts`, `console.ts`; data in `src/life/data/**` (one folder per crew).
- Shared edits (LIFE-CORE only): `src/game/optional.ts` (installs it after the NPCs and the content),
  `src/npc/crowd/stations.ts` (`marketDay`, `registerStations`, the `shutters` and `banner` dressing),
  `src/npc/crowd/trades.ts` (Pliny's salutatio post removed, Appendix A.1), `src/npc/stationDirector.ts`
  (keepers at posts, shutters while shut, market days), `src/npc/NpcManager.ts` (`stationLife`, keeper
  spawning, markers on a keeper's post), `src/npc/brain.ts` (a station post before a named schedule; a
  keeper off duty goes home), `src/npc/props.ts` (`makeShutters`, `makeBanner`), `src/interaction/Interactions.ts`
  (`get(id)`), `src/content/talk.ts` (the rumour pool feeds `rumors()`, so popinae, barbers and the
  citizens' news hear it), `src/rpg/data/items/index.ts` + `items/life.ts`, `conditions.ts` +
  `conditions-life.ts`, `vendors.ts` + `vendors-life.ts` (empty merge points the crews fill),
  `src/ui/hud/Hud.ts` ("· Nundinae" on market days), `src/dev/console/commands.ts` (`registerCommands`).
- Tests: `tests/life-data.test.ts` (validateLife on the real data and the examples, a broken fixture,
  the history lint on phase-2 quests), `tests/life-core.test.ts` (gates, options, keepers, cards,
  rumours, the save).

## How to try it

`npm run dev`, then open `/?at=subura&hour=12&lifex=1` (`lifex=1` loads the worked examples of
`src/life/data/_examples.ts`). Open the console (`` ` ``) and type `life goto vinarius`: you stand in
front of Sextus Pompeius Hedone, the example wine-seller, at the wine shop on the Vicus Longus. **E**
talks; "Show me your wares." trades; "Pour me a taste" costs an as and passes on a rumour. `life open
act.example.card` sits you on the bench (an as, an hour, the screen dims). `sethour 21`: the shop is
shut, its shutters are up and the counter says "Closed · opens at the third hour". `life` prints the
counts and (in dev) any data problems; `life rumours` prints today's picks.

## The rules every crew writes against

1. **All content is data** in `src/life/data/<lane>/*.ts`, each file `export default defineLife({ ... })`.
   An eager glob finds them; `_` files are examples (left out of the game).
2. **`npm test` validates it** (`tests/life-data.test.ts`): ids and prefixes, every reference (items,
   NPCs, stations and posts, vendor kinds, quests, festivals, skills, conditions, factions, districts,
   boards), Roman hour marks, prices in whole quadrantes, shops with stock, keepers with 2+ topics,
   rumour lengths (280; notices 400), and the history and story lint: nothing built or ruling after AD
   113 (`registry.ts POST_113`), never Hermogenes, Euhodus only for repairs, never "Piperataria" or
   "pepper warehouse", real people (Trajan, Plotina, Hadrian, Pliny, Martial) never speak.
3. **Ids** (§3.4): `keeper-<district>-<trade>`, `st-life-<district>-<trade>`, `act.<place>.<what>`,
   `rec.<bench>.<item>`, `wgr.<game>.<place>`, `rum.<lane>.<topic>`, `job-<place>-<verb>`, `board-<place>`.
4. **Money** is denarii: `AS` = 1/16, `QUADRANS` = 1/64 (`src/rpg/money.ts`). The runner adds the price
   to the choice: "Bathe (a quadrans)".
5. **Hours** are Roman marks (`h1`…`h12`, `v1`…`v4`, `src/content/hours.ts`); a keeper's hours are its
   station's `when` (crowd/budget.ts phases), written once.
6. **Nothing per frame**: life ticks at 2 Hz, rumours are picked once per game hour, positions are stored
   vectors. No materials or geometries at runtime (the shutters and banners are cached dressing).

## game.life (install.ts)

```ts
game.life.isOpen('keeper-subura-pistor')          // at the post now (on duty, alive, market day if it needs one)
game.life.opensAt('keeper-subura-pistor')         // "at the fourth watch" | "on the next market day" | null
game.life.rumours({ board: 'board-subura' }, 4)   // today's picks: same all day and through a load
game.life.rumours({ district: 'dist-subura', kind: 'talk' }, 1)
game.life.open('act.subura.board')                // what E does on a thing
game.life.take(owner, option)                     // gates, price, daily, effects, then 'life:option'
game.life.status()                                // { keepers, open, activities, interactables, rumoursToday, problems }
// beyond the §3.2 contract:
game.life.apply(owner, option)                    // take() with the text said ({ ok, why, text })
game.life.blocked(owner, option)                  // why it is off now, or null
game.life.store.today(key) / addToday(key, n)     // daily counters in the life save (jobs per day, a table's losses)
game.life.store.get(key) / set(key, value)        // small saved values (open munus bets, the pallet's rent day)
game.life.districtHere(), dead(id), keeper(id), whereIs(id), data
```

Events: `'life:option' { owner, option, detail }` (detail.stolen at the baths, detail.omen; job steps
send option `job:<jobId>:<stepId>`), `'life:crafted'`, `'life:wager'` (emitted by the CRAFT crew).

Console: `life`, `life keepers`, `life goto <id>`, `life open <id>`, `life rumours [board|district|talk|cry|notice]`,
`job start <id>`.

## Worked examples, crew by crew

Every block below is in `src/life/data/_examples.ts` or follows it; copy, rename, change.

### B. SHOPS — a keeper at an existing station

```ts
// src/life/data/keepers/subura.ts
import { AS } from '../../../rpg/money';
import { defineLife } from '../../types';

export default defineLife({
  keepers: [
    {
      id: 'keeper-subura-vinarius',
      district: 'dist-subura',
      station: 'st-subura-vinarius',   // crowd/trades.ts: its `when` is the shop's hours
      member: 0,                        // the "Wine-seller" member becomes this person
      name: 'Sextus Pompeius Hedone',
      title: 'Wine-seller',
      barks: ['An as for the house wine, two for the better!'],
      shop: { vendor: 'vinarius', stock: [{ id: 'vinum', count: 12 }, { id: 'vinum-falernum', count: 2 }] },
      talk: {
        greet: 'Salve! Hedone’s, the best cellar on the Vicus Longus.',
        topics: [
          { ask: 'Where does the wine come from?', say: 'The hills behind Tibur, in a cart, at night.' },
          { ask: 'Busy street.', say: 'The Subura never sleeps, and when it does it snores.' },
        ],
        news: 'What’s the word in the Subura?',
      },
      closed: [{ kind: 'shutters', out: 4.3, side: 0.2 }],   // optional: default is 0.9 m behind the keeper
      period: 'Hedone’s price list, CIL IV 1679 [A, Pompeii]',
    },
  ],
});
```

- The keeper is an NpcDef `keeper-subura-vinarius` (no home, no schedule) tagged `keeper` and
  `vendor:vinarius`; barter keys the shop by that id. `trade` defaults to "Show me your wares." and the
  daily haggle comes with it. Trade and services show only while the shop is open.
- New vendor kinds go in `src/rpg/data/vendors-life.ts` (`VENDORS_LIFE`).
- A new post: `station: { id: 'st-life-tuscus-aerarius', lane: 'vicus-tuscus', at: 0.42, when: [...],
  members: [{ role: 'artisan', out: 3.4, side: 0, loop: 'work', face: 'in', prop: null, label: 'Coppersmith' }],
  dressing: [{ kind: 'anvil', out: 2.9, side: 0 }] }` (the StationDef shape of crowd/stations.ts).
- Market day: give the inline station `marketDay: true` and a `{ kind: 'banner', … }` dressing; it is
  manned only on the nundinae (every 8th elapsed day), with no shutters on other days.
- Shot: `node scripts/shot.mjs --query "at=subura&hour=12" --steps '[{"eval":"game.console.exec(\"life goto vinarius\")"},{"wait":2500},{"eval":"game.life.isOpen(\"keeper-subura-vinarius\")"},{"shot":"life/shops/vinarius.png"}]'`

### C. SERVICES — options on a keeper, a named NPC, and a thing

```ts
// on a keeper (the bath attendant) or in a ServiceSet for an existing NPC:
services: [
  {
    id: 'bathe',
    text: 'Bathe',
    price: QUADRANS,
    gate: { hours: [{ from: 'h8', to: 'h11' }] },          // hidden unless
    needs: { gate: { notFlag: 'banned-from-baths' }, why: 'The attendant shakes his head.' },  // shown off with why
    daily: false,
    effects: [{ kind: 'bathe' }, { kind: 'rumour' }],
    result: ['In you go. Mind the slaves with the strigils.', 'The water’s hot. Today.'],
  },
],
```

```ts
// src/life/data/services/vendors.ts — life lines for an existing named NPC
services: [{ npc: 'npc-cerinthus', services: [{ id: 'laundry', text: 'Wash my clothes', price: 3 * AS, effects: [{ kind: 'clean', to: 'normal' }], result: 'Leave them with me.' }] }],
```

and in that NPC's dialogue (`src/dialogue/content/vendors.ts`), one spread each:

```ts
const life = lifeChoices('npc-cerinthus');          // src/life/talk.ts
person({ id: 'npc-cerinthus', …, choices: [...life.choices], nodes: { ...life.nodes } });
// a hand-written dialogue whose hub isn't 'hub': lifeChoices(id, 'myHub')
```

A thing (`act.<place>.<what>`):

```ts
activities: [
  { id: 'act.fountains.wash', name: 'Street fountain', verb: 'Wash', at: { streetSpots: 'fountain', max: 6 },
    gate: { sordidus: true }, options: [{ id: 'wash', text: 'Wash', effects: [{ kind: 'clean', to: 'normal' }], result: 'Cold, but clean enough.' }], period: '[A]' },
  { id: 'act.subura.board', name: 'Notice board of the vicus', verb: 'Read the notices',
    at: { landmarkSpot: 'subura:notice', replaces: 'capfora:subura:notice' },   // takes over the builder's Read prompt
    gate: { questDone: 'mq-01-madida-capena' }, board: 'board-subura', period: '[A, Pompeii]' },
],
```

- One option and no intro: E runs it at once with a toast (the fountain). Otherwise E opens a card in
  the conversation panel: the intro (a list rotates), the options, Leave.
- A board lists 2–4 of today's notices for its id (at most 2 hooks); a hooked notice offers "Note it
  down", which starts the quest (journal only while the main quest runs).
- `at` kinds: `{ place: '<location/landmark/landmark spot id>', dx?, dz? }`, `{ landmarkSpot: 'lm:spot'
  or 'spot', replaces?: '<interactable id>' }`, `{ streetSpots: 'fountain', max? }`, `{ station, dressing }`.
- The board spots' Read ids: capfora builders use `capfora:<landmark>:<spot>` (the Subura's is
  `capfora:subura:notice`); find others with `game.interactions.get(id)` in a shot.
- Conditions go in `src/rpg/data/conditions-life.ts` (`LIFE_CONDITIONS`).

### D. CRAFT and GAMES — recipes, wagers, and the hooks

```ts
recipes: [{ id: 'rec.mortar.posca', bench: 'mortar', name: 'Mix posca', skill: 'medicina', minLevel: 0,
  inputs: [{ item: 'acetum', count: 1 }, { item: 'aqua', count: 1 }], output: { item: 'posca', count: 2 }, hours: 0.25, xp: 10, period: '…' }],
wagers: [{ id: 'wgr.tali.subura', game: 'tali', stakes: [AS, 2 * AS, 3 * AS, 4 * AS], bank: 3, watchRadius: 18, period: '…' }],
services: [{ npc: 'npc-demetrius', bench: 'mortar' }],   // "Could I use your mortar?" in his talk
keepers: [{ id: 'keeper-subura-aleator', …, wager: 'wgr.tali.subura' }],   // "Deal me in. (Dice)"
```

The runtime lives in `src/life/craft/*` and `src/life/wager/*`. installLife loads every module there and
calls each exported `install…(game)` function; register what the choices do:

```ts
// src/life/craft/bench.ts
import { registerBench } from '../talk';
export function installLifeBench(game: Game) {
  registerBench('mortar', (g, owner) => !!g.dialogue.start(`bench:${owner}`, { name: 'Mortar', dialogueId: 'life:bench' }));
}
// src/life/wager/tali.ts
registerWager('tali', (g, wager, owner) => …);   // a card of rounds; emit 'life:wager'
```

Keep a table's daily losses with `game.life.store.addToday(`bank:${wager.id}`, won)`, and open munus
bets with `game.life.store.set('munus-bets', […])`.

### E. JOBS and LUDUS — defineJob and the conversations

`defineJob(def)` (src/life/jobs/defineJob.ts) returns the QuestDef (category 'radiant', repeatable) and
registers the job with the conversations:

```ts
import { registerJob } from '../talk';
registerJob({
  def,
  step: (game) => /* the JobStep the player is on, from the quest's stage, or null */,
  offerable: (game) => /* passes(def.offer, game), the daily cap (game.life.store.today(`job:${def.id}`) < def.daily), not running */,
});
```

- A giver lists the job (`jobs: ['job-portus-saccarius']` on the keeper or ServiceSet): their talk
  offers "Any work going? (Porter at the river port)" while `offerable`; choosing it starts the quest.
- A step whose `done` is `{ talk: npcId }` or `{ deliver: { item, count, to } }` adds a line to that
  person's talk; for a delivery the items are taken, then `'life:option'` fires with option
  `job:<jobId>:<stepId>` — the job advances on it.
- `QuestSystem.start` never takes the tracker from a running main quest.

### F and G. QUESTS — keepers, rumours and hooks

```ts
keepers: [{ id: 'keeper-subura-receptatrix', district: 'dist-subura', station: { id: 'st-life-subura-receptatrix', … }, … }],
rumours: [
  { id: 'rum.quests-f.hilara-lead', kind: 'talk', districts: ['dist-circus-maximus'], gate: { questRunning: 'misc-hilara' },
    text: 'A big Molossian with a bronze bulla runs with the pack behind the starting gates.' },
  { id: 'rum.quests-f.hilara-notice', kind: 'notice', boards: ['board-forum'], hook: 'misc-hilara', latin: 'CANIS · AVFVGIT', text: '…' },
],
```

- A hooked rumour shows only after mq-01 is done and until its quest starts. A missed offer keeps
  coming back on other days.
- Quests listen to `'life:option'` (the Bath Thief: `owner` the attendant, `detail.stolen`).
- Check another crew's NPC with `game.npcs.has('keeper-subura-receptatrix')`.

### H. CITY VOICE — rumours and items

```ts
rumours: [
  { id: 'rum.city.mule-prices', kind: 'talk', text: 'Mule prices have doubled since the doors of Janus opened.' },
  { id: 'rum.districts.subura-fire', kind: 'talk', districts: ['dist-subura'], text: '…' },
  { id: 'rum.cries.market', kind: 'cry', gate: { marketDay: true }, text: 'Nundinae! Country cheese, honey, figs, at the Forum Boarium!' },
  { id: 'rum.notices.games', kind: 'notice', boards: ['board-meta', 'board-forum'], gate: { if: (g) => !!g.munus?.status }, latin: 'VELA · ERVNT', text: '…' },
],
```

- `districts` are the crowd's ids (`dist-subura`, `dist-forum-romanum`, `dist-fora-imperialia`,
  `dist-velia`, `dist-vallis-colossei`, `dist-velabrum-boarium`, `dist-circus-maximus`,
  `dist-porta-capena`) and, where the crowd has none, the barks' (`dist-capitolium`, `dist-palatium`,
  `dist-forum-holitorium`). `rumours.ts districtHere(x, z)` says which one a point is in.
- Talk picks reach every popina keeper, barber and citizen through `content/talk.ts rumors()`; a
  keeper's `rumour` effect and the barber's haircut pass one on; Cerdo reads `cry` picks.
- Items go in `src/rpg/data/items/life.ts` (`LIFE_ITEMS`).

## Stations, keepers and the shutters

- `StationHost.keeperFor(def, member)` (NpcManager → `stationLife`) names the keeper at a post;
  NpcManager spawns that NpcDef there (`spawnNamed`) and sets `npc.station`. A keeper never spawns
  anywhere else, and a post stays empty while its keeper is dead, held or staged by a quest.
- Off duty with the player within 85 m, a keeper's station keeps its dressing and puts up its
  `closed` dressing (default: shutters behind the keeper); the counter prompt within 60 m reads
  "Closed · opens at the third hour". A dead keeper's station is shut for good ("Closed. The keeper is
  dead."): deaths are kept in the life save and the world deltas.
- Market-day stations (`marketDay: true`) are manned only when `game.barter.isMarketDay()`.
- Quest markers on a keeper who is not in the world point at their post (`positionOf` → `postOf`).

## Budgets (§5.5)

installLife ≤ 5 ms (0.6 ms measured with the examples, `game.life.installMs`); a 2 Hz tick; at most
40 life interactables in a place (`status().interactables`); the life save ≤ 16 KB after 10 days
(tested); no runtime materials or geometries (`makeShutters`, `makeBanner` are `cachedDressing`).
