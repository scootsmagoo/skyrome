/** Whether hair uses alpha-to-coverage (needs an MSAA target). Its own tiny module so main.ts does not pull the hair code into the boot path. */
let a2c = true;
const listeners: (() => void)[] = [];

export const hairAlphaToCoverage = () => a2c;
export function setHairAlphaToCoverage(on: boolean) {
  a2c = on;
  for (const l of listeners) l();
}
/** hairMaterial.ts registers here to update its material when the setting changes. */
export const onHairAlphaToCoverage = (fn: () => void) => void listeners.push(fn);
