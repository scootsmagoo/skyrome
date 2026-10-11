/**
 * STREETS crew: a Node module hook for `streets-fit.mjs`. It sends `street-fit.mjs`'s import of
 * `./boot.mjs` to `./streets-boot.mjs` (extra URL parameters, the drawn terrain on the profile's
 * diagonal); nothing else changes.
 */
export async function resolve(specifier, context, next) {
  if (specifier === './boot.mjs' && context.parentURL && /\/scripts\/audit\/street-fit\.mjs$/.test(context.parentURL)) {
    return next('./streets-boot.mjs', context);
  }
  return next(specifier, context);
}
