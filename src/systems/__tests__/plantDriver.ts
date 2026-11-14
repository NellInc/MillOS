/**
 * The plant measurement harness's driver, for other review instruments (the
 * Chronicle probe, plan item 4c). The driver lives in the harness itself,
 * which is still being extended, so this module only re-exports it: one copy
 * of the mirrored component calls, read from one place. Importing the harness
 * registers its suites, and each of them is skipped unless its own output
 * variable is set.
 */
export {
  extractDockPredicates,
  extractRoster,
  LINE_RATE,
  runPolicy,
  type ArmResult,
  type Policy,
  type ShiftRow,
} from './plantMeasure.playtest.test';
