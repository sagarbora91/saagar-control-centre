# Phase 6J.0 — Release controller checkpoint

The owner-approved release identity is package `com.saagartraders.bcc`, display version `V6`,
Android `versionName 2.9`, `versionCode 209`, minSdk 23 and targetSdk 34. The approval is recorded in
`PHASE-6J0-RELEASE-IDENTITY-APPROVAL-2026-08-24.json`.

The display label and About-shell identity are updated together. The historical V5.5 change-log
heading remains attached to the content it describes. Four
retired Phase 6C tests that were previously skipped now execute against the immutable historical
fixture and the completed production-asset retirement. Phase 6J acceptance remains fail-closed on
any fail, skip, todo or cancellation.

Production signing and publication are not authorized by the identity approval. Signing secrets
must be supplied process-locally by Sagar and must never enter Git or evidence. The tracked signer
policy expects certificate SHA-256
`DF7877F01D2956A7C9134ACA06BF91FF03A953AFEBC561BF520B2B4D55F98519`.

The retained versionCode is an explicit release constraint. If the selected distribution channel
requires a value greater than 209, the controller must stop and obtain a new exact owner-approved
versionCode. No increment may be inferred.
