/** Public API of the UI module. */
export { installUI, UIManager, type InputBlocker } from './UIManager';
export { showTitle, TitleScreen, type TitleOptions } from './screens/TitleScreen';
export { showLoading, type LoadingHandle, type LoadingOptions } from './screens/LoadingScreen';
export type { Modal } from './Modal';
export { BaseModal } from './Modal';
export type { MenuTabId } from './menus/MenuShell';
export type { BannerOptions, BannerKind, NotifyKind } from './hud/Feed';
export * from './types';
export * from './adapters';
export { toInscription, toCapitals, romanHour, formatMoney } from './format';
