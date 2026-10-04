/** Every ambient vignette type. */
import { crier, dice, procession, sacrifice } from './civic';
import { fabae, umbra } from './lemuria';
import { drunk, torchlitReturn, vigilesRound } from './night';
import { dogSausage, fallingPot, hawker, scuffle, thief } from './street';
import type { VignetteDef } from './types';

export const VIGNETTES: readonly VignetteDef[] = [scuffle, dogSausage, fallingPot, thief, hawker, sacrifice, procession, crier, dice, drunk, torchlitReturn, vigilesRound, fabae, umbra];

export type { VignetteDef, VignetteContext, VignettePlan, Cue } from './types';
