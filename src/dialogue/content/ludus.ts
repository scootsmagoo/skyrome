/**
 * The Ludus Magnus (docs/CONTENT.md §3.2.1, lud-01-sacramentum): Glaucus the doctor (sign on as a
 * guest or swear the oath), Successus at the armory (kit), Asiaticus the referee (calls the three
 * bouts), Auctus the thraex (the Mus topic), Nereus (after the bout, and the missio at its end),
 * Hermippus the physician (patches you up and tells you to rest until the lamps are lit), the
 * procurator Celer and the tiro Pullus. Node ids the quest reacts to:
 *
 *   npc-glaucus      n1 (the offer; starts the quest), signedGuest, signedOath; named (mq-02's clue)
 *   npc-successus    issueScutum, issueParmula, issueOwn
 *   npc-asiaticus    begin1, begin2, begin3; lusioBegin (job-ludus-lusio, the daily practice bout)
 *   npc-auctus       mus (the clue; also completes mq-02 'ask')
 *   npc-nereus       spared, struck (the missio choice)
 *   npc-hermippus    patched
 *
 * After lud-01 Asiaticus offers the daily practice bout (job-ludus-lusio, world-life §4.7), and
 * Hermippus' talk carries the life lines of src/life/talk.ts (his mortar, when the CRAFT crew's
 * bench is there).
 */
import { completed, female, hourNow, outcome, questVar, rotate, running, stage, treat } from '../../content/talk';
import { person } from '../../content/people';
import { lusioFoe } from '../../life/jobs/lusio';
import { jobKey } from '../../life/jobs/defineJob';
import { jobRuntime, lifeChoices } from '../../life/talk';
import { defineDialogue, type DialogueContext } from '../types';

const LUD = 'lud-01-sacramentum';
const MQ2 = 'mq-02-tabella';
const LUSIO = 'job-ludus-lusio';

/** Why the practice bout can't be had now (shown on the disabled choice), or '' when it can. */
const lusioWhy = (c: DialogueContext) => {
  const rt = jobRuntime(LUSIO);
  if (!rt || rt.offerable(c.game)) return '';
  return (c.game.life?.store.today(jobKey(LUSIO)) ?? 0) > 0 ? 'One bout a day for guests.' : 'Only in drill hours.';
};
const STAGES = ['start', 'kit', 'bout1', 'bout2', 'bout3', 'missio', 'done', 'done-half'];
/** How far lud-01 has got (−1 before it starts; the end stages count as the last). */
const reached = (c: DialogueContext, s: string) => {
  const q = c.quest(LUD);
  if (!q || (!q.running && !q.done)) return false;
  return STAGES.indexOf(q.stage) >= STAGES.indexOf(s);
};
const boutOn = (c: DialogueContext) => Number(questVar(c, LUD, 'bout')) || 0;

// ------------------------------------------------------------------ Glaucus

const glaucus = defineDialogue({
  id: 'npc-glaucus',
  npcs: ['npc-glaucus'],
  priority: 80,
  start: (c) => {
    // The main quest first: Gratus sent the player for a name (mq-02 'ludus').
    if (stage(c, MQ2) === 'ludus' && !c.flag('clue-mus')) return 'mq0';
    const q = c.quest(LUD);
    if (q?.done) return 'd0';
    if (q?.running && q.stage !== 'start') return boutOn(c) ? 'fighting' : 'g0';
    return 'n0';
  },
  nodes: {
    // ---- mq-02: who fights with a curved blade?
    mq0: {
      text: '(A scarred, grey-haired Thracian with a long practice stick looks you up and down.) You stand like a baker. What does a baker want with my school?',
      choices: [{ text: 'A courier was knifed at the Capena Gate this morning. A curved blade, one stroke up from under. Gratus of the frumentarii wants the man’s name.', goto: 'mq1' }],
    },
    mq1: {
      text: 'Up from under. (He spits in the sand.) That’s how a thraex finishes a man on his knees, when the crowd shouts Iugula. Nobody uses it in the street. Nobody but Dizas.',
      next: 'named',
    },
    named: {
      text: 'Dizas, the Mouse. A thraex of mine until last winter: good feet, quick hands, and the hands went into everybody’s purse. I threw him out for stealing from the sick-room. Now he runs a crew of knife-men out of a burned-out taberna off the Vicus Tuscus, near the Velabrum.',
      effects: (c) => c.setFlag('clue-mus', true),
      next: 'mq2',
    },
    mq2: {
      text: 'Go carefully. He fights better than he looks, and he looks like a rat. (He taps your chest with the stick.) And when you’re done with him, come back if you ever want to earn silver on my sand. I take paying guests.',
      end: true,
    },
    n0: {
      text: 'Look at your feet. No, don’t look at them, I’m looking at them. You stand like a baker. What do you want, baker?',
      choices: [
        { text: 'To fight on your sand.', goto: 'n1' },
        { text: 'To fight. Does that bother you?', if: female, goto: 'n0f' },
        { text: 'Just looking.', end: true },
      ],
    },
    n0f: { text: 'Bother me? Domitian had women fighting by torchlight, and the crowd nearly tore the benches out. They’ll love you twice as fast and the matrons will hate you twice as hard. That’s your business. Fighting is mine.', next: 'n1' },
    n1: {
      text: 'Two ways onto my sand. Guest: you fight for a purse, you go home at night, you’re nobody’s. Or the oath: “to be burned, bound, beaten and killed by the sword.” Sworn men get ranks, and a name the crowd knows. And a stain that never washes out.',
      choices: [
        { text: 'As a guest.', goto: 'n2' },
        { text: 'Tell me exactly what the oath costs.', goto: 'n3' },
        { text: 'I’ll swear the oath.', goto: 'n4' },
      ],
    },
    n2: { text: 'Sensible. Guests are paid three denarii a practice bout and they bleed the same. Go and see Successus.', next: 'signedGuest' },
    signedGuest: { speaker: 'player', text: '(You are on the roll as a paid guest. The armory is at the far end of the courtyard.)', effects: (c) => c.setFlag('ludus-status', 'guest'), end: true },
    n3: {
      speaker: 'player',
      text: 'SACRAMENTVM GLADIATORIVM — Swearing makes you an auctoratus: Infamia +20 at once (it never falls below 10 again), a bar to the equestrian ring while Infamia is above 20, and every public bout adds +2. In return: the Ludus ranks (tiro → rudiarius), the crowd’s recognition, better purses.',
      next: 'n1',
    },
    n4: {
      text: 'Then say it after me, and mean it: uri, vinciri, verberari, ferroque necari.',
      choices: [
        { text: '“Uri, vinciri, verberari, ferroque necari.”', goto: 'n5', effects: (c) => void c.game.factions?.join('ludus-magnus') },
        { text: 'On second thought, as a guest.', goto: 'n2' },
      ],
    },
    n5: { text: 'Welcome, tiro. Now you belong to the sand, and the sand belongs to Caesar. Successus will give you wood. Earn iron.', next: 'signedOath' },
    signedOath: { speaker: 'player', text: '(You have sworn the gladiator’s oath. Infamia stains you for life.)', effects: (c) => c.setFlag('ludus-status', 'auctoratus'), end: true },
    // ---- while the bouts are on
    g0: { text: 'Successus has your kit. Then Asiaticus has your bout. Go.', end: true },
    fighting: { text: 'Eyes on him, not on me!', end: true },
    // ---- afterwards
    d0: {
      text: 'Again? Good. Not today. Your arms are lying to you; they say they’re fine.',
      choices: [
        { text: 'The man with the curved blade. Who?', if: (c) => stage(c, MQ2) === 'ludus' && !c.flag('clue-mus'), goto: 'named' },
        { text: 'Train me.', end: true, effects: (c) => c.openService('train') },
        { text: 'Farewell.', end: true },
      ],
    },
  },
});

// ------------------------------------------------------------------ Successus (kit and arena stock)

const successus = defineDialogue({
  id: 'npc-successus',
  npcs: ['npc-successus'],
  priority: 80,
  start: (c) => (stage(c, LUD) === 'kit' ? 'k0' : 'hub'),
  nodes: {
    k0: {
      text: 'One rudis, one shield, one signature. Bring them back or I’ll know. Which shield: the big curved scutum, or the little thraex parmula?',
      choices: [
        { text: 'The scutum.', goto: 'issueScutum' },
        { text: 'The parmula.', goto: 'issueParmula' },
        { text: 'I’ll bring my own shield.', if: (c) => !!c.game.player?.inventory?.equipped('offHand'), goto: 'issueOwn' },
      ],
    },
    issueScutum: { text: '(He hands you a scarred wooden sword and a battered shield stamped LVD·MAG. He makes you sign for both.) That scutum has blocked more blows than you’ve thrown. Wood for practice, iron for Caesar.', end: true },
    issueParmula: { text: '(He hands you a scarred wooden sword and a small square shield with the paint flaked off. He makes you sign for both.) The parmula doesn’t forgive a slow arm. Wood for practice, iron for Caesar.', end: true },
    issueOwn: { text: 'Your own shield, then. The sword stays mine: real steel is refused at a lusio. Wood, or nothing.', end: true },
    hub: {
      text: (c) => rotate(c, '_hub', ['One rudis, one shield, one signature. Bring them back or I’ll know.', 'Wood for practice, iron for Caesar.', 'That scutum has blocked more blows than you’ve thrown.']),
      choices: [
        { text: 'What do you keep for sale?', if: (c) => completed(c, LUD) || !!c.game.player?.inventory?.count('rudis'), end: true, effects: (c) => c.openService('barter') },
        { text: 'Vale.', end: true },
      ],
    },
  },
});

// ------------------------------------------------------------------ Asiaticus (the referee)

const asiaticus = defineDialogue({
  id: 'npc-asiaticus',
  npcs: ['npc-asiaticus'],
  priority: 80,
  start: (c) => {
    const s = stage(c, LUD);
    if (s === 'bout1' || s === 'bout2' || s === 'bout3') {
      if (boutOn(c)) return 'calls';
      // After a refused missio the doctor keeps the player off the sand for an hour.
      if (Number(questVar(c, LUD, 'retryAfter')) > (c.game.time?.totalHours ?? 0)) return 'rest';
      return `ready${s.slice(4)}`;
    }
    if (s === 'kit') return 'needKit';
    // The daily practice bout (after lud-01): the call, then "Ready."; while it runs, the bout.
    if (c.quest(LUSIO)?.running) return Number(questVar(c, LUSIO, 'bout')) ? 'calls' : 'lusio';
    return 'hub';
  },
  nodes: {
    lusio: {
      text: (c) => `${lusioFoe(c.game.time?.dayIndex ?? 0).call}, against the guest! Practice arms, and the crowd decides the purse. Show them something worth paying for.`,
      choices: [{ text: 'Ready.', goto: 'lusioBegin' }, { text: 'One moment.', end: true }],
    },
    lusioBegin: { text: 'A horn! Shields up! The sand is hungry!', end: true },
    ready1: {
      text: 'Pullus, a boy from Capua, against the guest! Practice arms! Parry with the shield, riposte on the beat, and dodge when you can’t parry. Lock on with X; the crowd likes a man who looks his enemy in the face.',
      choices: [{ text: 'Ready.', goto: 'begin1' }, { text: 'One moment.', end: true }],
    },
    ready2: {
      text: 'Auctus the thraex! Eighteen wins! He fights low and he hooks round your shield: a block is not a wall. Dodge, circle, and mind the parmula.',
      choices: [{ text: 'Ready.', goto: 'begin2' }, { text: 'One moment.', end: true }],
    },
    ready3: {
      text: (c) => `Nereus! Retiarius! Victor of thirty-one! ${female(c) ? 'And the crowd has heard there is a woman on the sand today. ' : ''}Watch the net: when he twirls it, step aside. If it lands, keep your shield up and pull. When he drops to one knee, the sand will be silent. The crowd asks, and you decide.`,
      choices: [{ text: 'Ready.', goto: 'begin3' }, { text: 'One moment.', end: true }],
    },
    begin1: { text: 'A horn! Shields up! The sand is hungry!', end: true },
    begin2: { text: 'A horn! Step apart when I say, not before!', end: true },
    begin3: { text: 'A horn! Fight!', end: true },
    calls: { text: 'Step apart! Step apart, I said, or I’ll part you.', end: true },
    rest: { text: 'The doctor says an hour. I say an hour. Sit, drink water, and try not to look at the net.', end: true },
    needKit: { text: 'A guest without a rudis on my sand? Successus at the armory, quickly, and bring wood, not iron.', end: true },
    hub: {
      text: (c) => rotate(c, '_hub', ['Shields up! The sand is hungry!', 'A finger! He raises a finger! Ad digitum!', 'The crowd asks: Mitte! or Iugula? Today, it asks Mitte!']),
      choices: [
        {
          text: (c) => {
            const why = lusioWhy(c);
            return `Put me on the sand. (A practice bout)${why ? ` — ${why}` : ''}`;
          },
          if: (c) => completed(c, LUD) && !!c.game.life && !!jobRuntime(LUSIO) && !c.quest(LUSIO)?.running,
          enabled: (c) => !!jobRuntime(LUSIO)?.offerable(c.game),
          effects: (c) => c.startQuest(LUSIO),
          goto: 'lusio',
        },
        { text: 'Teach me to hold a shield.', if: (c) => completed(c, LUD), end: true, effects: (c) => c.openService('train') },
        { text: 'Vale.', end: true },
      ],
    },
  },
});

// ------------------------------------------------------------------ Auctus (the thraex)

const auctus = defineDialogue({
  id: 'npc-auctus',
  npcs: ['npc-auctus'],
  priority: 80,
  start: (c) => (reached(c, 'bout3') ? 'a0' : 'b0'),
  nodes: {
    b0: {
      text: 'After the bout, stranger. I don’t talk to people I haven’t hit.',
      choices: [
        { text: 'A courier was knifed at the Capena Gate. Up from under, with a curved blade.', if: (c) => stage(c, MQ2) === 'ludus' && !c.flag('clue-mus'), check: { skill: 'rhetoric', difficulty: 25, pass: 'mus', fail: 'b1' } },
        { text: 'After the bout, then.', end: true },
      ],
    },
    b1: { text: 'Hm. After the bout.', end: true },
    a0: {
      text: 'Good bout. You parry like a man who’s been hit a lot. That’s a compliment.',
      choices: [
        { text: 'A courier was knifed this morning with a stroke from below, a curved blade.', if: (c) => stage(c, MQ2) === 'ludus' && !c.flag('clue-mus'), goto: 'mus' },
        { text: 'How do I beat Nereus?', goto: 'a1' },
        { text: 'Farewell.', end: true },
      ],
    },
    a1: { text: 'Don’t be where the net lands. If it lands on you, raise your shield and pull; he always follows with a big slow poke. And don’t let him make you run; the crowd hates a runner.', next: 'a0' },
    mus: {
      text: 'Up from under, like a thraex finishing a man on his knees? That’s our stroke. Nobody uses it in the street… except Dizas. The Mouse. Glaucus threw him out last winter for stealing a cloak from the Saniarium. Now he runs knife-men out of a burned taberna off the Vicus Tuscus.',
      effects: (c) => c.setFlag('clue-mus', true),
      end: true,
    },
  },
});

// ------------------------------------------------------------------ Nereus

const nereus = defineDialogue({
  id: 'npc-nereus',
  npcs: ['npc-nereus'],
  priority: 80,
  start: (c) => {
    const q = c.quest(LUD);
    if (q?.running && q.stage === 'missio') return 'm0';
    if (q?.done) return 'r0';
    return 'idle';
  },
  nodes: {
    // ---- the missio (a lusio: nobody dies, and the winner decides)
    m0: {
      speaker: 'player',
      text: '(Nereus kneels on the sand, one finger raised, ad digitum. The benches are on their feet. Asiaticus lifts his staff and waits for you.)',
      choices: [
        { text: 'Spare him. Mitte!', goto: 'spared' },
        { text: 'Strike the yielded man.', goto: 'struck' },
      ],
    },
    spared: {
      text: (c) => (c.flag('lud01-favor') && Number(c.flag('lud01-favor')) >= 50 ? 'Mitte! Mitte! Mitte!' : 'Mitte! Mitte!') + ' (Nereus laughs and catches the hand you offer.) “Again, one day. With iron, if Caesar pays for it.”',
      effects: (c) => {
        c.game.devotion?.sparedYielded();
        c.game.standing?.addFame('dist-vallis-colossei', 2);
        c.game.factions?.addReputation('plebs', 2);
        c.setFlag('nereus-spared', true);
      },
      end: true,
    },
    struck: {
      text: '(Asiaticus’ staff is there before your blade is. The benches boo.) “In a lusio, citizen, nobody dies. Not today.”',
      effects: (c) => {
        c.game.factions?.addReputation('ludus-magnus', -5);
        c.setFlag('nereus-spared', false);
      },
      end: true,
    },
    // ---- after the bout (dlg-lud01-nereus)
    r0: {
      text: 'You blocked my net with your shield. Nobody does that. Everybody tries to run.',
      choices: [
        { text: 'You were holding back.', goto: 'r1' },
        { text: 'Teach me the spear.', goto: 'r2' },
        { text: 'Thirty-one wins. Why are you still here?', goto: 'r3' },
      ],
    },
    r1: { text: 'In a lusio? Of course. And so were you, I hope. If not, you have work to do.', next: 'r0' },
    r2: { text: 'The trident is a spear that changed its mind three times. Come at the eighth hour.', effects: (c) => c.openService('train'), end: true },
    r3: { text: 'Because the sand is the only place in Rome where everyone can see you’re good at something.', next: 'r0' },
    idle: {
      text: (c) => rotate(c, '_idle', ['The net has no edges. Only patience.', 'Thirty-one wins, and I still pray before each one.', 'I mend my nets in the evening. Come back when the sand has had its say.']),
      end: true,
    },
  },
});

// ------------------------------------------------------------------ Hermippus (the physician)

const hermippusLife = lifeChoices('npc-hermippus');

const hermippus = defineDialogue({
  id: 'npc-hermippus',
  npcs: ['npc-hermippus'],
  priority: 80,
  start: (c) => (completed(c, LUD) && !c.flag('hermippus-patched') ? 'patch' : 'hub'),
  nodes: {
    patch: {
      text: 'Lie down. You’ll be a hero tomorrow; today you’re a patient. (He sluices a cut with vinegar, binds a rib, and clucks over a bruise.) Rest till the lamps are lit. Doctor’s orders, and the doctor is me.',
      effects: (c) => {
        treat(c);
        c.setFlag('hermippus-patched', true);
        c.game.events.emit('rpg:notify', { text: 'Hermippus patches you up. Press T to wait until the lamps are lit.', kind: 'info' });
      },
      next: 'patched',
    },
    patched: { speaker: 'player', text: '(He sets a cup of watered wine in your hand.)', end: true },
    hub: {
      text: (c) => rotate(c, '_hub', ['Vinegar, honey and silence. Mostly silence.', 'The best wound is the one you stepped away from.', 'Lie down. You’ll be a hero tomorrow; today you’re a patient.']),
      choices: [
        { text: 'Treat my wounds. (2 den.)', enabled: (c) => c.denarii() >= 2, effects: (c) => { if (c.pay(2)) treat(c); }, goto: 'treated' },
        { text: 'What do you sell?', end: true, effects: (c) => c.openService('barter') },
        { text: 'Teach me. (Medicina)', end: true, effects: (c) => c.openService('train') },
        // His mortar and anything else the life of the city gives him (src/life/talk.ts).
        ...hermippusLife.choices,
        { text: 'Vale.', end: true },
      ],
    },
    treated: { text: '(He works quickly, with the air of a man who has seen worse before breakfast.) Done. Don’t thank me; thank Aesculapius, he sends the patients.', next: 'hub' },
    ...hermippusLife.nodes,
  },
});

// ------------------------------------------------------------------ the rest of the school

const celer = person({
  id: 'npc-celer',
  greet: (c) => `(An heavy equestrian with a gold ring and a slave with tablets at his elbow.) Sextus Attius Celer, procurator of the Ludus Magnus, the emperor’s school. ${hourNow(c) < 12 ? 'Guests sign here' : 'Guests signed this morning'}. The sworn sign there. The dead sign nothing.`,
  again: ['Each pair costs Caesar more than a ship. Fight like it.', 'The Column will want games. Games want men.', 'Quid vis? Money is my business; blood is Glaucus’.'],
  topics: [
    { ask: 'How does the school work?', say: 'Caesar owns the school and the men in it: the sworn, the slaves, the condemned. Paying guests are my idea and they pay for the benches. Everything is in pairs, citizen. Pairs of fighters, pairs of swords, pairs of accounts: what comes in and what goes out.' },
    { ask: 'I’m looking for a man who hires knives.', say: 'Then you are in the wrong building, or the right one. Half the men in here could hire out a knife. Ask in the barracks. Nobody talks to strangers.', once: true },
    { ask: 'Is it true Nereus has never been touched?', say: 'In pairs, I said. Thirty-one wins, and a scar for every one of them that he doesn’t show. The crowd prefers legends. I prefer accounts.' },
  ],
});

const tirones = person({
  id: 'npc-ludus-tirones',
  npcs: ['npc-pullus'],
  greet: '(A thin boy with a first beard and a wooden sword that is too big for him.) You’re the guest. Glaucus says I’m to hit you. I’m sorry in advance.',
  again: ['My mother thinks I’m a baker.', 'Go easy. Not too easy. Medium.', 'Is it true they throw roses? Or is it just the bread?'],
  topics: [
    { ask: 'Why did you sell yourself to the school?', say: 'Debts. My father’s, then mine. Fifteen hundred sesterces and a year of sand, and then I’m a freeman with a name the crowd knows. Or I’m ash. Glaucus says ash is rare. I’d like to see the count.' },
    { ask: 'Any advice for the bout?', say: 'Block early, strike when he’s tired, and don’t listen to the crowd. They’ll shout for me. They always shout for the one who’s losing.' },
  ],
});

export default [glaucus, successus, asiaticus, auctus, nereus, hermippus, celer, tirones];

