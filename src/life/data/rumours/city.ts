/**
 * The city's talk, citywide (world-life.md §4.9, the CITY VOICE crew). 'talk' rumours are folk
 * gossip: popina keepers, barbers and citizens pass them on (content/talk.ts rumors()). Nothing
 * here names the Pepper Warehouses, a ruler after AD 113, or a main-quest secret (docs/STORY.md).
 * Real people are mentioned, never speak. Dated by the city's own habits, not by events we invent.
 */
import { defineLife } from '../../types';

export default defineLife({
  rumours: [
    { id: 'rum.city.water-cold', kind: 'talk', text: 'The Aqua Traiana has been running down from the Janiculum for four years, and some of the Aventine still says it tastes of stone. Everything tastes of stone until you are thirsty.', period: 'Aqueduct of Trajan, opened 109 [A]' },
    { id: 'rum.city.dacian-gold', kind: 'talk', text: 'Dacian gold is everywhere now. The moneychangers at the Basilica weigh it twice and smile once. Somebody made a fortune on the Danube, and it was not the soldiers.', period: 'Dacian war booty in circulation after 106 [P]' },
    { id: 'rum.city.eastern-king', kind: 'talk', text: 'The Parthian king will not stop sending letters to the Emperor, and the Emperor is said to be packing for the East. Do not buy a cloak for a journey. Wait till they tell you where to march.', period: 'Parthian succession disputes, 111–113 [A]', weight: 0.6 },
    { id: 'rum.city.bread-dear', kind: 'talk', text: 'Bread is dear again. The bakers blame the grain fleet, the grain fleet blames the weather, and the weather blames nobody, which is the only honest thing said in this city all month.' },
    { id: 'rum.city.bath-tip', kind: 'talk', text: 'Tip the attendant at the Titus baths or leave your cloak with your conscience. A cloak a day goes missing from there, and the attendant swears he never saw it.', weight: 0.5, period: 'Cloakroom theft in the public baths [A, Rome]; the Titus bath stories [G]' },
    { id: 'rum.city.dogs-tiber', kind: 'talk', text: 'Strays in the Campus and the Tiber islands are running in packs again. Nobody feeds them, and everybody swears they are somebody else’s dog.' },
    { id: 'rum.city.fire-lamps', kind: 'talk', text: 'Keep your lamp on a hook and off the bed. Two insulae in the Subura went up last winter because somebody wanted to read after the second hour of the night.', period: 'Fires from lamps in insulae (vigiles reports) [P]' },
    { id: 'rum.city.vigiles-night', kind: 'talk', text: 'The Vigiles walk the streets at night with their buckets and their clubs, and they are proud of it. Ask a fireman the time, and he will tell you the hour in a voice you can hear in Ostia.' },
    { id: 'rum.city.grain-ships', kind: 'talk', text: 'Three grain ships docked at Ostia this week, and the dockers are proud as princes. They say the Emperor pays them in wine, and then they say it again in case you did not believe them.', period: 'Ostia grain trade under the Emperor’s charity [P]' },
    { id: 'rum.city.sun-clock', kind: 'talk', text: 'The sundial by the Saepta has been an hour fast since the spring. The clerks keep the right time by the water clock at the fountain, and everyone else keeps it by their stomach.' },
    { id: 'rum.city.theatre-stolen', kind: 'talk', text: 'A player from the Pompeian troupe was robbed of his mask and his purse on the Velabrum steps, and he has been performing the whole theft in the wine shops since. He gets better every time.', weight: 0.7 },
    { id: 'rum.city.summer-heat', kind: 'talk', text: 'It will be a hot summer. The old men say so, and the old men have been right about the heat since Augustus was a boy.' },
    { id: 'rum.city.patron-word', kind: 'talk', text: 'A knight’s son I know was given three hundred sesterces and a slave for a single good word in the Forum. The word was “excellent”. He is still paying for it.', weight: 0.4, period: 'Patronage and clientela in the late Republic and under Trajan [P]' },
  ],
});
