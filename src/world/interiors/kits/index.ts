/** The generic interior kits (generic.ts): one per kind of door. */
import type { InteriorKit } from '../generic';
import { domusKit } from './domus';
import { insulaStairKit } from './insulaStair';

export const KITS: InteriorKit[] = [insulaStairKit, domusKit];
