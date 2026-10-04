/** Game flow & integration: boot, title, character creation, saving, settings (docs/modules/flow.md). */
export { startRome, romeParams, V01_SYSTEMS, type RomeParams } from './boot';
export { GameFlow, START_DATE, START_HOUR, TITLE_HOUR, FIRST_QUEST, type FlowState, type FlowOptions } from './GameFlow';
export { Calendar, ANCHORS, FESTIVALS } from './calendar';
export * from './character';
export { PRESETS, presetValues, controlState, guessPreset, type ControlPreset } from './settings';
export { registerAtlasLocations, landmarkLocation } from './locations';
export { AtlasMapSource } from './mapSource';
export { PlayerLook } from './PlayerLook';
