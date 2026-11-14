# Архив веток Nexora — 14 ноября 2026 года

В рамках перехода к единственной рабочей ветке `main` проведена ревизия исторических refs. Здесь зафиксированы полные SHA веток перед очисткой.

## Решение

- `main` — единственный рабочий source of truth. Стабильная опубликованная версия и исходники в `main` могут различаться: объединение исходников не равно GitHub Release.
- Релизные исходники Connect 3.6.0: PR #110, merge `ff8f123e1202c8128fdc2eb621cc16d8b1013071`. Внешние release gates #77 остаются открытыми.
- Экспериментальные Communities 3.7.0: PR #114, флаг `experimentalCommunities` по умолчанию выключен; release gates #78 остаются открытыми.
- Закрыты устаревшие PR #67 и #95, более поздняя реализация входит в текущую историю через PR #70 и #92.
- Исторические ветки 3.1–3.5, одноразовые CI/diagnostics, уже объединённые и superseded website/docs изменения не переносятся повторно. Старые версии Trust/MLS намеренно не восстанавливаются.
- Все удаляемые ветки сохраняются в одном архивном теге `archive/branches-before-main-only-2026-11-14`: его архивный commit содержит старые branch tips в качестве родителей, не изменяя код в `main`.
- Удаление выполняет `.github/workflows/branch-consolidation-once.yml` только после проверки отсутствия открытых PR и успешного сохранения архивного тега. Если проверка не проходит, автоматическое удаление прекращается.

## Манифест исходных веток

Зафиксировано `99` non-main refs на момент создания документа. SHA позволяют восстановить точные коммиты, не полагаясь на названия удалённых веток.

### `agent/` — 55

- `agent/advanced-docs-matrix-completion` — `882cb2dca1905dd3118b03c8dfc81fdfb43027b7`
- `agent/advanced-docs-tz` — `d4680ab6bb0c9665778f70a2a2affb8ca51a7f87`
- `agent/advanced-documentation-portal` — `15aa5b91b6f7784fac1384a9d40598cb19d903d4`
- `agent/capture-pr51-failures` — `c258d015361b0753e928dcfd8676594776642351`
- `agent/capture-windows-performance-3.3.2` — `643d9a69cb9a29cfc308d835d1a2ef093d576fd2`
- `agent/diagnose-3.3.2-release` — `d496bb7452e2907c285165b78ca31625e144e2d4`
- `agent/diagnose-post-release-3.3.2-v2` — `e3dd6e2ab974fb380980872bd1fc072202a81c85`
- `agent/diagnose-post-release-3.3.2` — `12d1c500554bf9b3277a3b6c12e7d6525d1ee423`
- `agent/diagnose-pr51-focused` — `0a5d576e4b32499acee7d212c3e9877ada426f7d`
- `agent/finalize-3.3.2-evidence` — `0e45527d6e514e5b890d129fa8e71d3cfaef2e44`
- `agent/finalize-3.3.2-evidence-v2` — `37281bcb672a71a494ca7f5b55de8713051a8417`
- `agent/fix-post-release-trigger` — `1875bc77216dd01bfad839e732f537e7d6db8331`
- `agent/fix-release-evidence-commit` — `670538ad37e8d92fc809cff09305d6a7fa28861e`
- `agent/fix-showcase-logo-pages` — `dfa0a0150d411f9bbaea2275b2da3bae3478e196`
- `agent/force-pages-redesign-deploy` — `dceed88bd404bf4bfc8af7aa4411e4d2ab7f540c`
- `agent/main-site-ux-motion-polish` — `f95be527b1b1816ece539db07363bc44fe0f1aa1`
- `agent/nexora-3.1.0-final` — `18c1fe2479f881e5215326240e95c248177d400a`
- `agent/nexora-3.1.0-local-pulse-integration` — `efffaa50bd161f25e0794e7af500e8c9cddff422`
- `agent/nexora-3.1.0-productization` — `c6cd145c0d4eb81e14d095b92c9d07c987c7a927`
- `agent/nexora-3.1.0-pulse-cloud-foundation` — `bd04d56e06a02bb7395ce6bb3a845f61b0fa51c3`
- `agent/nexora-3.1.1-production-hardening` — `d9c7126601250e9d44df25a85216c3bbc80ee5c2`
- `agent/nexora-3.1.2-bugfix` — `f5a68d065ee381ab9faa7f1982d8181ab0962e32`
- `agent/nexora-3.1.2-final` — `5161a5e9d61fffe0e2a77c5a0b62bc7fb9ae06a5`
- `agent/nexora-3.2.0-main-sync` — `bccd697202ee94242f49dde1f2cf9decb58cb09b`
- `agent/nexora-3.2.0-trust-core` — `0ee6e3f0b4417d031a6f42150ac5e21b08917499`
- `agent/nexora-3.2.0-trust-core-mls` — `3e3f672442b13a8b3a76eac74cb4ae7d439959c0`
- `agent/nexora-3.2.1-login-shutdown-fix` — `a7a2e30076368eaac909053c89862e509aee7e5f`
- `agent/nexora-3.2.1-performance-gate-stabilization` — `c0fb9ea47f4a2084a704d64818fca0f3d9db0cf2`
- `agent/nexora-3.2.2-trust-bootstrap-race` — `58ca7a52cb9112c14fd2aea837dee4d589eaf827`
- `agent/nexora-3.2.3-security-hardening` — `418303a8cf1552ee30480dfc51e7461f0582bd41`
- `agent/nexora-3.2.4-updater-mls-recovery` — `195360edf1660d324bbd80174e2bd55fb518c381`
- `agent/nexora-3.2.5-ui-console-performance` — `d9667f9fc4b0b1c59d97095491e54362b9da457f`
- `agent/nexora-3.3.0-full-release` — `7d83bce963d5a774f9c107a5cf8d3a05130c1d44`
- `agent/nexora-3.3.1-server-startup-fix` — `3161ea6e97e6e58f34e341f1b70d763c8550a9a3`
- `agent/nexora-advanced-docs-site` — `10e9854512fb223bbd560381c9bed439f40b2435`
- `agent/pages-issue-verification-4` — `468c2ddb322bdee1aa8a9adfbcd297e5464910ab`
- `agent/pages-live-verification-3` — `f2c8053ef83dc1360d29ffbb071b8d970b18e264`
- `agent/project-showcase-site` — `8da165b83273d8b78ff231e1fa54b8e4e6390694`
- `agent/readme-architecture-diagram` — `88227f5756c52e3cb48b3682a9a73072187add34`
- `agent/record-pages-live-verification` — `7408b8b0d86a2b84b118b79bfa8b2493ab397ec2`
- `agent/release-3.3.2-clean-final` — `436d533b4e917a4a050a1f33f4d33a1db3d95580`
- `agent/release-3.3.2-complete-consistency` — `053a39e44d1ae79a8ffef98716d1261cd3006f87`
- `agent/release-3.3.2-consistency` — `863af7552db377af0e273df5f258f665b3a2ab41`
- `agent/release-3.3.2-consistency-final` — `183835940b9abbf75911e057387186597228133d`
- `agent/release-3.3.2-final` — `863af7552db377af0e273df5f258f665b3a2ab41`
- `agent/release-3.3.2-tests-final` — `869ae4f0ab491a63776f7ec4af75614170bc3971`
- `agent/release-trigger-guard` — `03f2ea7b1506d8d33a9803075f6dfc1308e9b3ff`
- `agent/remove-pages-issue-trigger` — `dc8e6dcbafad5a8cc2f8d73898f3637fa75e7b9a`
- `agent/replay-3.3.2-evidence` — `6fa6f2bb8c2e71599fd7f0f58420242d42f5a2a3`
- `agent/repository-file-organization` — `4b9b76c23ffcc0d6dda5c8a712f3bf3edaa89fec`
- `agent/restore-3.2.5-site-ux` — `351f75b2db302e12a40feb305a8cd431895dabbd`
- `agent/restore-canonical-ci-3.3.2` — `a615a96bad2c349646604c877eedb6e17c13d950`
- `agent/revert-out-of-scope-pr54` — `11ce656b14a13d7de52e115899d340bfba7af37c`
- `agent/verify-3.2.2-publication` — `406896107a302fd7d8456cbc88c6c37441a10056`
- `agent/verify-3.2.3-publication` — `22e3ffafcc3d217aa45d2652605b38e84d2c5436`

### `automation/` — 3

- `automation/nexora-3.1.0-finalize` — `f58e5ef0ff809019d7772d8882894c156bc8cb6f`
- `automation/nexora-3.1.0-tag` — `aee8225713cabc8fbdbf7ca7ec2cd014ec5d906d`
- `automation/nexora-3.1.2-finalize` — `8ed0be3d72917fcea763053f68c797f954c48dfa`

### `chore/` — 2

- `chore/repository-root-cleanup` — `bd919172ab9213373622d67a2852e6ae47019b26`
- `chore/3.5.0-post-release-cleanup` — `f6402c95b001e66db9ea57061681f0fc1a726341`

### `docs/` — 12

- `docs/advanced-content-integrity` — `6ff16dabaa3378d238f97672ae11068e21041d81`
- `docs/advanced-content-visuals` — `405d02b29101e061e7ade6d928ab5403385a9bcc`
- `docs/branch-status-index` — `8768b15ca5577b54603c1de94877cc741ca45479`
- `docs/community-standards` — `f48b8154faae4ed113224ef0184ba092d01332b2`
- `docs/github-issues-projects-wiki` — `227c5f2953191d1ec6d430fab80275e1e375bbc6`
- `docs/nexora-3.2.5-release-status` — `d13e53ae7aead166092b7e224c8a20ff370e3154`
- `docs/official-product-documentation-3.2.0` — `4899cb8d4fdbac4f23081602e0271b07edcbc310`
- `docs/official-product-documentation-3.2.3` — `4a190b0aae80aa9ceb29eca47094b658e54a65b9`
- `docs/reconcile-all-branches-3.2.4` — `991b550ba0d87de1e3494fc85a54a38056e00659`
- `docs/roadmap-3.4-4.0` — `e7e97111f4b2aa908d4fb86c0cbe5c183081e78c`
- `docs/sync-3.1.2` — `0618efd410c243ea6f07b5b4abb700025ae25684`
- `docs/3.5.0-status-sync` — `1ee5050c39dce8872690d36727402651e2597755`

### `feat/` — 4

- `feat/aether-sandbox-physics` — `73d3dd36f047145cfdd275261b6993036405b8db`
- `feat/communities-foundation` — `a50181af70b18937519cf7c90a593030036092ca`
- `feat/website-aether-game` — `88e7847c3004201dadaff91218bddc5bf5c57e78`
- `feat/website-aether-game-clean` — `650f62d5ae537695061922a4ea130d97040922ca`

### `fix/` — 10

- `fix/mobile-layout-calm-aether` — `13087c684522cfa4e18daae5b47e15e5ccf09121`
- `fix/3.5.0-android-unsigned-verification` — `b91519b447869ff57d8715c316a551dadbde9f02`
- `fix/3.5.0-production-dependency-audit` — `2059986e194191a696a51408413686b401cebdb5`
- `fix/3.5.0-release-diagnostics` — `0e85d91b7ead2a1d37c9d2b56d31d1f7e077ac59`
- `fix/3.5.0-release-trigger` — `6dd38abc067de765cfe53e71ced2fe86ae337cc0`
- `fix/3.6.0-ci-privacy-media` — `e589b03a73ec082e34b7f02db9af3ad02566da19`
- `fix/3.6.0-legacy-search-block-privacy` — `0b8b52e7549b163503571d0b74ded9191a55709e`
- `fix/3.6.0-user-search-pagination` — `459e2de7b473cbae9fb6d4867827008078d935e1`
- `fix/3.7.0-community-member-list-pagination` — `b2ab80c627509bf8e56c70b4a182fbaa646f8586`
- `fix/3.7.0-community-membership-pagination` — `a7c03c81637d165d693a758218abcf2505253495`

### `ops/` — 5

- `ops/cancel-duplicate-3.5.0-release` — `e8142750c945ed2bb6b6aa411525609f3b126417`
- `ops/restore-3.5.0-release-status` — `62006a29dd1478d1c7227a03f76c4448e19296b4`
- `ops/3.5.0-release-log` — `8958c5fe61b5ee1882b77232d45ca6ef1c27cfb2`
- `ops/3.5.0-release-log-tail` — `5efc83f0f272a3ef5fb4c02de6ca40877b0153ee`
- `ops/3.5.0-release-observer` — `63341da2d8650675ede41f9b6adfcc163a959bab`

### `release/` — 8

- `release/3.3.3` — `025409653f2fecb0096ce86479258342a8f5edc9`
- `release/3.3.4-post-mls` — `54907da60fa5d81bf0e597cf48c98124246ace67`
- `release/3.3.4` — `97081578c378bcb44ddc8c5455b67048c37bda03`
- `release/3.4.0-stable-core` — `b340b46fc87b93ab7b31e3d38d4d8ed6a2818038`
- `release/3.4.0-stable-promotion` — `445f00749d84088815a8883d3db243a73c4a4e51`
- `release/3.5.0-mobile-continuity` — `e5764cfd1f5148651862a4a28e4f8b6f6d5a8c26`
- `release/3.5.0-unsigned-publication` — `cad72186c795e3d20825cdcbc570114b1fc891b6`
- `release/3.6.0-connect` — `ef915fdf1bcb39501b720a41e59eeed97954e82c`

## Восстановление

Архивный тег хранит все указанные commit histories без дополнительных рабочих веток. После проверки существования тега конкретную историческую ветку при необходимости можно восстановить от её SHA. Повторное объединение со свежим `main` требует отдельного code review — происхождение коммита само по себе не подтверждает актуальность изменения.
