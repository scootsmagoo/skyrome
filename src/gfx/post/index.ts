/** Post-processing pipeline. See PostFX.ts. */
import type { Game } from '../../core/Game';
import { PostFX, type PostOptions } from './PostFX';

export function installPostFX(game: Game, opts: PostOptions = {}): PostFX {
  if (game.post) return game.post;
  const post = new PostFX(game, opts);
  game.post = post;
  game.addSystem(post);
  return post;
}

export { PostFX } from './PostFX';
export type { PostOptions, ToneMap, GradeParams } from './PostFX';
