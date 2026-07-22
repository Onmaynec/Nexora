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

console.log("Nexora 3.3 deterministic source patches applied.");
