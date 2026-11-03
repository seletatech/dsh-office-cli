# DSH compatibility verification — 2026-11-03

The original source is meliwanx/dsh-office-cli at 58a93935644b9f6849280010b091fce947d9cb0f, MIT. This update keeps the native bundle, tools, skill provider, authentication helper and source-only packaging. It changes no DSH distribution or model/Agent loop.

## Compatibility

The original peer ranges reject installation on DSH 0.2.2-alpha.2. The update retains the legacy ranges and adds only the exact tested preview versions. Development dependencies are pinned to the current SDK; integration tests support its native batch executor and the legacy single-call executor.

- Original locked SDK 0.1.0-rc.7: baseline typecheck and 13 tests passed.
- Current locked SDK 0.2.2-alpha.2, Cordis 4.0.6-alpha.1, Schemastery 3.18.6-alpha.1, Node24.22.2: typecheck and 15 tests passed.
- The legacy matrix tests the same plugin against the original SDK, including registration, execution and disposal. The new batch-executor approval test is intentionally skipped only in that matrix.
- Full official DSH 0.2.2-alpha.2: an isolated, credential-free Web profile installs the packed plugin without a version exemption; `skills/list` exposes `dsh-office-cli` exactly once and as model-invocable, including after a cold restart. Native `dsh plugin ... remove dsh-office-cli`, followed by another cold start, removes the skill. SDK disposal also removes both tool registrations.

## Approval regression

An option value resembling help or dry-run previously changed the risk of a send command. The tests reproduce failure against the pre-fix source and pass with the correction. Classification now uses the command prefix rather than option payloads. Only the tool's explicit `dry_run` field provides the preview classification, and the vendor preview flag is inserted before value-taking options. Preview requests reject conflicting preview values and option terminators.

The real current DSH executor checks a synthetic CLI fixture: no approval service denies writes; pending approval does not execute; rejection does not execute; one-time approval executes exactly once; a later request requires approval again; dry-run payload edge cases leave the synthetic send marker unchanged; an agent-less call fails closed. No real platform messages were sent.

## Limits

These checks prove native integration and synthetic approval behavior for the named versions. They do not prove real Feishu/WeCom/DingTalk authorization, all platform APIs, cloud multi-user credential isolation, or SMTP/IMAP support. The bundled skill remains the progressive CLI discovery guide; complete vendor skill trees are not vendored. Real platform/account validation and any production deployment remain separate work.
