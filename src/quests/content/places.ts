/**
 * Not a quest: installs the named places the v0.1 content refers to (landmarks the quests target,
 * fallback positions for the landmark builders' contract spots, and content-only spots such as the
 * popina on the Vicus Tuscus). installRpg registers the `locations` export of every quest module.
 * See src/content/places.ts.
 */
import { CONTENT_LOCATIONS } from '../../content/places';

export const locations = CONTENT_LOCATIONS;
