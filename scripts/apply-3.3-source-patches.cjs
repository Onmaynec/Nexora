"use strict";

const fs = require("node:fs");
const path = require("node:path");

function patchFile(relativePath, patches) {
  const file = path.resolve(__dirname, "..", relativePath);
  let content = fs.readFileSync(file, "utf8");
  for (const { find, replace, label } of patches) {
    if (content.includes(replace)) continue;
    if (!content.includes(find)) throw new Error(`Patch anchor not found for ${relativePath}: ${label}`);
    content = content.replace(find, replace);
  }
  fs.writeFileSync(file, content, "utf8");
}

patchFile("client/src/components/MessagePane.jsx", [
  {
    label: "ConfirmDialog import",
    find: 'import VoiceRecorder from "./VoiceRecorder";\nimport VoicePlayer from "./VoicePlayer";',
    replace: 'import ConfirmDialog from "./ConfirmDialog";\nimport VoiceRecorder from "./VoiceRecorder";\nimport VoicePlayer from "./VoicePlayer";',
  },
  {
    label: "delete dialog state",
    find: '  const [editHistory, setEditHistory] = useState(null);\n  const fileInputRef = useRef(null);',
    replace: '  const [editHistory, setEditHistory] = useState(null);\n  const [deleteTarget, setDeleteTarget] = useState(null);\n  const [deleteBusy, setDeleteBusy] = useState(false);\n  const fileInputRef = useRef(null);',
  },
  {
    label: "delete action",
    find: '  async function searchCurrent(event) {',
    replace: '  async function confirmDelete() {\n    if (!deleteTarget || deleteBusy) return;\n    setDeleteBusy(true);\n    try {\n      await emitAck(socket, "message:delete", { messageId: deleteTarget.id });\n      setDeleteTarget(null);\n      await onRefresh();\n    } catch (error) {\n      showToast(error.message, "error");\n    } finally {\n      setDeleteBusy(false);\n    }\n  }\n\n  async function searchCurrent(event) {',
  },
  {
    label: "delete handler",
    find: 'onDelete={(item) => window.confirm("Удалить сообщение? Это действие нельзя отменить.") && action("message:delete", { messageId: item.id })}',
    replace: 'onDelete={setDeleteTarget}',
  },
  {
    label: "delete dialog render",
    find: '      {imagePreview && <div className="lightbox" role="dialog" aria-modal="true" aria-label="Просмотр вложения" onClick={() => setImagePreview(null)}><button type="button" onClick={() => setImagePreview(null)}><X size={22} /></button>{imagePreview.kind === "image" ? <img src={imagePreview.url} alt={imagePreview.name} onClick={(event) => event.stopPropagation()} /> : <iframe src={`${imagePreview.url}?preview=1`} title={imagePreview.name} onClick={(event) => event.stopPropagation()} />}<span>{imagePreview.name}</span></div>}\n    </section>',
    replace: '      {imagePreview && <div className="lightbox" role="dialog" aria-modal="true" aria-label="Просмотр вложения" onClick={() => setImagePreview(null)}><button type="button" onClick={() => setImagePreview(null)}><X size={22} /></button>{imagePreview.kind === "image" ? <img src={imagePreview.url} alt={imagePreview.name} onClick={(event) => event.stopPropagation()} /> : <iframe src={`${imagePreview.url}?preview=1`} title={imagePreview.name} onClick={(event) => event.stopPropagation()} />}<span>{imagePreview.name}</span></div>}\n      <ConfirmDialog open={Boolean(deleteTarget)} danger busy={deleteBusy} title="Удалить сообщение?" description="Сообщение будет заменено системной отметкой. Это действие нельзя отменить." confirmLabel="Удалить" onCancel={() => !deleteBusy && setDeleteTarget(null)} onConfirm={confirmDelete} />\n    </section>',
  },
]);

patchFile("cloud/create-cloud-server-v11.cjs", [
  {
    label: "preserve raw Stripe webhook body",
    find: '  app.use(express.json({ limit: "256kb", strict: true }));',
    replace: '  const jsonBody = express.json({ limit: "256kb", strict: true });\n  app.use((request, response, next) => request.path === "/v1/provider/webhooks/stripe" ? next() : jsonBody(request, response, next));',
  },
]);

patchFile("CHANGELOG.md", [
  {
    label: "3.3.0 changelog entry",
    find: "Формат основан на Keep a Changelog. Версии следуют Semantic Versioning.\n\n## [3.2.5] — 2026-07-22",
    replace: `Формат основан на Keep a Changelog. Версии следуют Semantic Versioning.

## [3.3.0] — 2026-07-23

### Добавлено

- серверный каталог Импульсов для оформления профиля, сообщений, реакций и возможностей комнат;
- атомарные Cloud/Sandbox purchases с double-entry ledger, idempotency и entitlements;
- самостоятельные Sandbox goals, contributions, refunds и receipts без обращения к отключённому Cloud;
- доступные in-app confirmation dialogs для удаления обычных и защищённых сообщений;
- полный release pipeline для signed builds или явно маркированных Client/Server/Android UNSIGNED TEST artifacts;
- переработанный сайт 3.3.0 с live GitHub data, direct downloads, signature labels и RU/EN.

### Исправлено

- MLS Welcome recovery больше не исчерпывает общий device bucket при открытии личных диалогов и комнат;
- Client объединяет параллельные recovery requests, соблюдает backoff и Retry-After;
- Sandbox endpoints больше не создают 409 для receipts и 503 для room goals;
- Cloud Account fallback не показывает undefined, а LOCAL TEST MODE не выходит за границы;
- voice waveform нормализуется по RMS/peak, отображает разную высоту и played-state;
- инертная иконка замка удалена из secure composer;
- website headings не пересекаются на кириллице, language/GitHub controls доступны для pointer и keyboard;
- Stripe webhook raw body не изменяется JSON middleware.

### Безопасность

- room purchases проверяют owner role, membership и ban на сервере;
- отрицательный баланс, client-defined price и повторное списание запрещены;
- unsigned test binaries не публикуют latest.yml или blockmap и недоступны production updater;
- plaintext downgrade и paywall для базового общения не добавлены.

### Совместимость

- Local Server schema 8 сохранена;
- Cloud DB получает additive migration impulse_purchases;
- API v3 и Trust/MLS API v4 расширены совместимо;
- обновление поддерживается с 3.2.0–3.2.5.

## [3.2.5] — 2026-07-22`,
  },
]);

patchFile("README.md", [
  {
    label: "current badge",
    find: "current-3.2.5%20prerelease",
    replace: "current-3.3.0%20prerelease",
  },
  {
    label: "release status table",
    find: "| `3.2.5` | Плавная отправка сообщений, восстановленный media UX, Pulse/SQLite fix и in-app release experience | Source/PWA prerelease для контролируемого тестирования |",
    replace: "| `3.3.0` | Trust recovery, расходуемые Импульсы, обновлённый Client UX, сайт и полный artifact pipeline | Signed release при наличии ключей или явно маркированный UNSIGNED-TEST prerelease |",
  },
  {
    label: "current release paragraph",
    find: '`3.2.5` прошла автоматические build-, unit-, API-, integration-, performance-, security-, soak- и Android source-gates. Она не является подписанным стабильным Windows-релизом и не заявляется как независимо аудированная E2EE-система. Авторитетные документы текущей линии:\n\n- [Release Notes 3.2.5](RELEASE_NOTES_3.2.5.md);\n- [Security Review 3.2.5](SECURITY_REVIEW_3.2.5.md);\n- [Release Verification 3.2.5](RELEASE_VERIFICATION_3.2.5.md).',
    replace: '`3.3.0` проходит build-, unit-, API-, integration-, performance-, security-, soak-, Android-, website- и Windows artifact-gates. При отсутствии сертификатов Windows/Android binaries публикуются только как явно маркированные `UNSIGNED-TEST` assets и не подключаются к production updater. Независимый E2EE-аудит не заявляется. Авторитетные документы текущей линии:\n\n- [Release Notes 3.3.0](RELEASE_NOTES_3.3.0.md);\n- [Security Review 3.3.0](SECURITY_REVIEW_3.3.0.md);\n- [Release Verification 3.3.0](RELEASE_VERIFICATION_3.3.0.md).',
  },
  {
    label: "3.3 feature block",
    find: '### Patch release 3.2.5\n\n- окно обновления внутри приложения, русские release notes и сохранённый signed-update gate;\n- быстрый encrypted outbox без полного reload истории после каждого сообщения;\n- исправленные Plus/Impulse команды с real-SQLite regression-тестом;\n- inline preview изображений и waveform-плеер голосовых после локальной расшифровки;\n- фоновое MLS Welcome recovery для гонки создания группы без plaintext downgrade;\n- memoized message rows, условная автопрокрутка и стабильный composer;\n- интерактивная сеть только внутри истории чата;\n- отдельные local и signed Windows build-команды.',
    replace: '### Release 3.3.0\n\n- conversation-scoped MLS Welcome limiting, Client coalescing, backoff и Retry-After;\n- расходуемый Impulse catalog с atomic ledger purchases и signed/local entitlements;\n- самостоятельные Sandbox goals, contributions и refunds без Cloud 503/409;\n- in-app confirmation dialogs для обычных и защищённых сообщений;\n- RMS/peak voice waveform с played color, animation, seek и playback rate;\n- исправленные Pulse overflow и account fallback states;\n- переработанный bilingual website с direct GitHub Release downloads;\n- signed production artifacts или явно маркированные UNSIGNED TEST installers без updater metadata.',
  },
  {
    label: "Pulse catalog bullets",
    find: '- Nexora Plus, Impulse double-entry ledger, receipts, billing portal и room goals;\n- signed Local Account ↔ Cloud Account linking;',
    replace: '- Nexora Plus, Impulse double-entry ledger, receipts, billing portal, room goals и расходуемый catalog;\n- персональные и room-scoped entitlements с server-defined price и idempotent purchase;\n- signed Local Account ↔ Cloud Account linking;',
  },
  {
    label: "architecture version",
    find: 'Nexora `3.2.5` не заявляет защиту от traffic analysis.',
    replace: 'Nexora `3.3.0` не заявляет защиту от traffic analysis.',
  },
]);

console.log("Nexora 3.3 deterministic source and documentation patches applied.");
