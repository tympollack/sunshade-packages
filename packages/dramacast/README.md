# `@digitalcanopy/dramacast`

DramaCast Director Engine, Drama Index scorer, compact vector telemetry codec, reaction timeline scrub synchronizer, and WebRTC PiP creator presence track (with V2 avatar rig seam).

## Entrypoints

- `@digitalcanopy/dramacast` — Full SDK surface & domain contracts
- `@digitalcanopy/dramacast/cartridge` — `CartridgePluginManifest` validation & `CartridgeRegistry`
- `@digitalcanopy/dramacast/director` — `scoreDramaMoment`, `scoreRollTrajectory`, `buildDirectorTimelinePlan`
- `@digitalcanopy/dramacast/telemetry` — `encodeTelemetryBundle`, `decodeTelemetryBundle`, `ReactionTimelineSynchronizer`
- `@digitalcanopy/dramacast/presence` — `WebRTCPiPPresenceTrack`, `AvatarRigPresenceTrack`, `createCreatorPresenceTrack`
