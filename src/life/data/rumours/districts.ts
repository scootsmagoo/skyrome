/**
 * The city's talk, by district (world-life.md §4.9, the CITY VOICE crew). A 'talk' rumour with
 * `districts` is heard only there (rumours.ts districtHere); the others are heard anywhere. Each
 * line is what a citizen of that place would say over a cup, short and a little gossipy. Nothing
 * here names the Pepper Warehouses, a ruler after AD 113, or a main-quest secret (docs/STORY.md).
 */
import { defineLife } from '../../types';

export default defineLife({
  rumours: [
    // ---- the Subura: noise, wine, fire and fuller's lye
    { id: 'rum.districts.subura-lye', kind: 'talk', districts: ['dist-subura'], text: 'Smell that? The fullers are at it again. Leave your white tunic at home unless you like the look of a dyed one.' },
    { id: 'rum.districts.subura-fire', kind: 'talk', districts: ['dist-subura'], text: 'The fire on the Vicus Patricius came down four floors in an hour. Nobody was hurt but a tortoise. The landlord has already raised the rent on the upper rooms.', period: 'Insula fires and landlord greed in the Subura [P]' },
    { id: 'rum.districts.subura-wine', kind: 'talk', districts: ['dist-subura'], text: 'The popina on the corner waters its Falernian. Everybody knows. Order the cheap stuff and you will at least know what you are drinking.' },
    { id: 'rum.districts.subura-fountain', kind: 'talk', districts: ['dist-subura'], text: 'Twelve women queue at the Subura fountain before dawn, and each of them has a theory about the thirteenth. Stand back and let the wise one speak.' },
    // ---- the Forum: the Senate, the courts, the bankers
    { id: 'rum.districts.forum-curia', kind: 'talk', districts: ['dist-forum-romanum'], text: 'The senators went into the Curia at dawn and came out at noon looking like men who had been arguing about road tolls. Probably they were.' },
    { id: 'rum.districts.forum-bankers', kind: 'talk', districts: ['dist-forum-romanum'], text: 'Do not lend to a man who smiles at the Basilica. The good bankers frown, and then they lend to you at twelve in the hundred anyway.', period: 'Interest rates under Trajan (12% usual) [A]' },
    { id: 'rum.districts.forum-speeches', kind: 'talk', districts: ['dist-forum-romanum'], text: 'A man on the Rostra called the aediles thieves and was applauded by the thieves. You cannot buy that kind of entertainment anywhere else in the city.' },
    // ---- the Imperial Fora: marble, workmen and the column
    { id: 'rum.districts.fora-marble', kind: 'talk', districts: ['dist-fora-imperialia'], text: 'Every block in the new Forum came from a different province. The masons say you can tell which by the way it cracks, and they are never wrong.' },
    { id: 'rum.districts.fora-column', kind: 'talk', districts: ['dist-fora-imperialia'], text: 'They are carving the Dacian soldiers round the Column in spirals, a whole war one turn at a time. The carvers say the top will be seen from the Capitol, if the Capitol looks.', period: 'Column of Trajan, a spiral frieze of the Dacian wars [A]' },
    { id: 'rum.districts.fora-scaffold', kind: 'talk', districts: ['dist-fora-imperialia'], text: 'Mind the scaffolding by the Basilica Ulpia. A slate fell last week, and the foreman says it was a Dacian prisoner’s fault. He says that about everything.' },
    // ---- the Velia and the upper Sacra Via: money and sneering
    { id: 'rum.districts.velia-house', kind: 'talk', districts: ['dist-velia'], text: 'The big house on the Velia is shut up again. The porter says the master is abroad and the mistress is at Baiae, and the shutters tell the truth better than either of them.', period: 'Shut houses of absent owners on the Velia [P]' },
    { id: 'rum.districts.velia-litters', kind: 'talk', districts: ['dist-velia'], text: 'Litter-bearers on the Velia earn three times a porter and wear twice the shoes. The Subura bearers say it is a conspiracy. They are right, and that is why it works.' },
    // ---- the amphitheatre valley: blood, lions and sleepless men
    { id: 'rum.districts.vallis-lions', kind: 'talk', districts: ['dist-vallis-colossei'], text: 'Lions cost more than a senator’s dinner this year. The Ludus keeps them in the cellars and feeds them better than the men who fight them.', period: 'Beast-hunts in the Colosseum; the cost of animals [P]' },
    { id: 'rum.districts.vallis-sleep', kind: 'talk', districts: ['dist-vallis-colossei'], text: 'The gladiators sleep under the stands with their helmets for pillows. If you want a quiet drink with one, ask after the fourth hour, when he has stopped counting the bouts.' },
    { id: 'rum.districts.vallis-baths', kind: 'talk', districts: ['dist-vallis-colossei'], text: 'The Titus baths open at the eighth hour, and not one minute before, whatever the bath attendant tells you about his own clock.' },
    // ---- the Circus: chariots, dogs and the factions
    { id: 'rum.districts.circus-factions', kind: 'talk', districts: ['dist-circus-maximus'], text: 'Greens or Blues? Say the wrong one and you will be told about it, loudly, in a wine shop that is also a fight.', period: 'Circus factions (factiones) [A]' },
    { id: 'rum.districts.circus-dogs', kind: 'talk', districts: ['dist-circus-maximus'], text: 'There are dogs behind the starting gates at night, big ones with bronze collars. The grooms say they guard the horses. The horses say nothing and sleep better for it.' },
    { id: 'rum.districts.circus-hilara', kind: 'talk', districts: ['dist-circus-maximus'], gate: { questRunning: 'misc-hilara' }, text: 'Ask about the pack behind the starting gates, and a groom will tell you that a big Molossian with a bronze bulla runs with it. Ask which bulla, and he will change the subject.', period: 'Stray dog packs near the Circus (Hilara lead) [G]' },
    // ---- the Velabrum and the cattle market: oxen, river and the port
    { id: 'rum.districts.velabrum-oxen', kind: 'talk', districts: ['dist-velabrum-boarium'], text: 'The oxen at the Forum Boarium have better manners than the drovers. Wait for the cart to pass; the ox will wait for you, and the cart will not.' },
    { id: 'rum.districts.velabrum-amphorae', kind: 'talk', districts: ['dist-velabrum-boarium'], text: 'Count the amphorae on the quay and you will get a different number every time. The porters say it is because the Tiber moves them while you look.' },
    // ---- the Forum Holitorium and the island: the vegetable market, the healers
    { id: 'rum.districts.holitorium-greens', kind: 'talk', districts: ['dist-forum-holitorium'], text: 'The greens at the Holitorium are fresher than the greens in the Subura, and twice as dear. Half the trick is in the price, and the other half is the cabbage farmer’s wife.' },
    { id: 'rum.districts.holitorium-snake', kind: 'talk', districts: ['dist-forum-holitorium'], text: 'The god of healing came up the Tiber in a ship, as a snake, in the old days. The island still keeps the ship, and the priests still keep the snakes, and you may pay the priests for both.', period: 'Aesculapius brought to the Tiber island, 293 BC (Livy 10.47) [A]' },
    // ---- the Capitol, the Palatine and the Porta Capena: the high and the far
    { id: 'rum.districts.capitol-geese', kind: 'talk', districts: ['dist-capitolium'], text: 'The sacred geese on the Capitol have been fed on barley and given the good seats. Somebody says they knew the Gauls were coming. Somebody else says they knew about the dinner.', period: 'The Capitoline geese (Livy 5.47) [A]' },
    { id: 'rum.districts.palatine-guards', kind: 'talk', districts: ['dist-palatium'], text: 'Men of the Guard on the Palatine ask your business three times and your father’s name once. Give the name, and do not say you were only looking at the view.' },
    { id: 'rum.districts.capena-tombs', kind: 'talk', districts: ['dist-porta-capena'], text: 'The carts come in through the Capena after dark, loaded with stone for the tombs on the Appian Way. Whoever sleeps by that gate sleeps badly, and then he is ready for the funerals of the ninth hour.', period: 'Night carts by day ban (Tabula Heracleensis) [A]' },
  ],
});
