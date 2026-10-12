/**
 * Final vertex counts of the biggest landmark batches (the 20 that hold 89 % of the 15.5 M
 * vertices), used on phones as each batch's starting capacity: the batch is made once at its final
 * size instead of growing 1.6x at a time, which left up to 1.7x its size in garbage arrays behind
 * and one more copy at `finish` (boot memory peak). A hint only: a batch that outgrows it grows as
 * before, one that stays under it is shrunk at `finish`. Measured with `lite=0` at the Forum; the
 * numbers go stale as landmarks change, which costs memory, not correctness.
 */
const SIZES: Record<string, number> = {
  'lmbatch:marble': 5855706,
  'lmbatch:travertine': 1498452,
  'lmbatch:bronze': 893670,
  'lmbatch:gilded_bronze': 675033,
  'lmbatch:plaster_white': 672195,
  'lmbatch:roof_tile': 622275,
  'lmbatch:brick': 502707,
  'lmbatch:terracotta': 400350,
  'lmbatch:tufa': 336117,
  'lmbatch:wood': 330237,
  'lmbatch:wood_dark': 304263,
  'lmbatch:marble:ns': 271959,
  'lmbatch:terracotta:ns': 254826,
  'lmbatch:black:ns': 221403,
  'lmbatch:foliage_broad': 219834,
  'lmbatch:grass:ns': 153528,
  'lmbatch:fabric_ochre': 144987,
  'lmbatch:fabric_ochre:ns': 124830,
  'lmbatch:plaster_cream': 123180,
  'lmbatch:river-hide': 122757,
};

/** Starting capacity for the landmark batch of this name (undefined: no hint). */
export function landmarkBatchSize(name: string): number | undefined {
  const n = SIZES[name];
  return n === undefined ? undefined : Math.ceil(n * 1.03);
}
