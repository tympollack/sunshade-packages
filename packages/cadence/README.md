# @digitalcanopy/cadence

Headless pacing state machine, zero-knowledge local persistence, pluggable micro-interaction widget deck, and feed virtualization adapters that cap doomscrolling, mitigate eye fatigue, and introduce intentional off-ramps across SunShade applications.

## Modules

- `@digitalcanopy/cadence` / `@digitalcanopy/cadence/core` — `CadenceConfig`, `SessionMetrics`, `BoundaryPolicy`, `cadenceReducer`, `createLocalStorageAdapter`, and `useCadenceSession`.
- `@digitalcanopy/cadence/widgets` — `registerWidget`, `getEnabledWidgets`, `getRandomWidget`, and baseline built-in widgets (`VocabWidget`, `ValeriePollWidget`, `PuzzleWidget`, `EyeBreakWidget`).
- `@digitalcanopy/cadence/adapters` — `ChapterEndCard`, `injectCadenceChapterSlots`, `useCozyCadenceFeed`, and `CozyFeedChapterCard`.
