from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace(path, before, after):
    file = ROOT / path
    source = file.read_text(encoding="utf-8")
    if before not in source:
        raise SystemExit(f"Expected block not found in {path}: {before[:120]!r}")
    file.write_text(source.replace(before, after, 1), encoding="utf-8")
    print(f"updated {path}")


replace(
    "client/src/components/SettingsPage.jsx",
    '''function deviceLabel(userAgent) {
  const value = String(userAgent || "");
  if (/Electron/i.test(value)) return { icon: MonitorSmartphone, title: "Nexora Client" };
  if (/Windows/i.test(value)) return { icon: Laptop, title: "Windows · браузер" };
  if (/Android|iPhone|Mobile/i.test(value)) return { icon: Smartphone, title: "Мобильный браузер" };
  return { icon: Laptop, title: "Браузер" };
}
''',
    '''function deviceLabel(userAgent) {
  const value = String(userAgent || "");
  if (/Electron/i.test(value)) return { icon: MonitorSmartphone, title: "Nexora Client" };
  if (/Windows/i.test(value)) return { icon: Laptop, title: "Windows · браузер" };
  if (/Android|iPhone|Mobile/i.test(value)) return { icon: Smartphone, title: "Мобильный браузер" };
  return { icon: Laptop, title: "Браузер" };
}

function clientUpdateStatusText(update) {
  if (!update) return "Загружаем состояние обновлений…";
  if (update.status === "checking") return "Проверяем GitHub Releases…";
  if (update.status === "downloaded") return `Версия ${update.availableVersion} готова к установке`;
  if (update.status === "downloading") return `Загрузка ${Math.max(0, Number(update.progress) || 0)}%`;
  if (update.status === "available") return `Доступна версия ${update.availableVersion}`;
  if (update.status === "current") return `Установлена актуальная версия ${update.currentVersion || ""}`.trim();
  if (update.status === "error") return update.error || "Не удалось проверить обновления";
  if (update.reason === "development") return "Проверка доступна в установленном Client";
  if (update.reason === "feed_not_configured") return "Канал обновлений не настроен";
  return "Автоматическая проверка включена";
}
''',
)

replace(
    "client/src/components/SettingsPage.jsx",
    '  const [update, setUpdate] = useState(null);',
    '  const [update, setUpdate] = useState(null);\n  const [updateBusy, setUpdateBusy] = useState(false);',
)

replace(
    "client/src/components/SettingsPage.jsx",
    '''    window.nexoraClient.updateStatus().then(setUpdate);
    const removeUpdate = window.nexoraClient.onUpdate?.(setUpdate);''',
    '''    window.nexoraClient.updateStatus()
      .then(setUpdate)
      .catch((error) => setUpdate({ status: "error", error: error?.message || "Не удалось получить состояние обновлений" }));
    const removeUpdate = window.nexoraClient.onUpdate?.(setUpdate);''',
)

replace(
    "client/src/components/SettingsPage.jsx",
    '''  async function installPwa() {
    const prompt = window.nexoraInstallPrompt;
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    window.nexoraInstallPrompt = null;
    setInstallReady(false);
  }
''',
    '''  async function checkClientUpdates() {
    if (!window.nexoraClient?.checkForUpdates || updateBusy) return;
    setUpdateBusy(true);
    setUpdate((current) => ({ ...(current || {}), status: "checking", error: null, reason: null }));
    try {
      const result = await window.nexoraClient.checkForUpdates();
      setUpdate(result);
      if (result?.status === "current") showToast("Установлена актуальная версия Nexora");
      else if (result?.status === "available") showToast(`Доступна Nexora ${result.availableVersion}`);
      else if (result?.status === "downloading") showToast(`Nexora ${result.availableVersion || ""} загружается`.trim());
      else if (result?.status === "downloaded") showToast(`Nexora ${result.availableVersion} готова к установке`);
      else if (result?.status === "error") showToast(result.error || "Не удалось проверить обновления", "error");
      else if (result?.reason === "development") showToast("Проверка обновлений доступна только в установленном Client", "error");
      else if (result?.enabled === false) showToast("Канал обновлений недоступен", "error");
    } catch (error) {
      const message = error?.message || "Не удалось проверить обновления";
      setUpdate((current) => ({ ...(current || {}), status: "error", error: message }));
      showToast(message, "error");
    } finally {
      setUpdateBusy(false);
    }
  }

  async function installPwa() {
    const prompt = window.nexoraInstallPrompt;
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    window.nexoraInstallPrompt = null;
    setInstallReady(false);
  }
''',
)

replace(
    "client/src/components/SettingsPage.jsx",
    '''        {window.nexoraClient?.checkForUpdates && <section className="settings-card update-card">
          <div className="settings-card-title"><DownloadCloud size={20} /><div><h3>Обновления Client</h3><span>{update?.status === "downloaded" ? `Версия ${update.availableVersion} готова` : update?.status === "downloading" ? `Загрузка · ${update.progress}%` : update?.status === "available" ? `Доступна ${update.availableVersion}` : update?.status === "current" ? "Установлена актуальная версия" : update?.reason === "feed_not_configured" ? "Канал обновлений не настроен" : "Автоматическая проверка"}</span></div></div>
          {update?.status === "downloaded" ? <button type="button" className="server-switch" onClick={() => window.nexoraClient.installUpdate()}>Перезапустить и установить</button> : <button type="button" className="server-switch" onClick={() => window.nexoraClient.checkForUpdates().then(setUpdate)}><RefreshCcw size={15} /> Проверить обновления</button>}
        </section>}''',
    '''        {window.nexoraClient?.checkForUpdates && <section className="settings-card update-card">
          <div className="settings-card-title"><DownloadCloud size={20} /><div><h3>Обновления Client</h3><span aria-live="polite">{clientUpdateStatusText(update)}</span></div></div>
          {update?.status === "downloaded" ? <button type="button" className="server-switch" onClick={() => window.nexoraClient.installUpdate()}>Перезапустить и установить</button> : <button type="button" className="server-switch" onClick={checkClientUpdates} disabled={updateBusy || update?.status === "checking" || update?.status === "downloading"}>{updateBusy || update?.status === "checking" || update?.status === "downloading" ? <LoaderCircle className="spin" size={15} /> : <RefreshCcw size={15} />} {update?.status === "checking" ? "Проверяем…" : update?.status === "downloading" ? `Загрузка ${Math.max(0, Number(update.progress) || 0)}%` : update?.status === "error" ? "Повторить проверку" : "Проверить обновления"}</button>}
        </section>}''',
)

(ROOT / "test/client-update-ui.test.cjs").write_text('''"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(path.resolve(__dirname, "../client/src/components/SettingsPage.jsx"), "utf8");

test("Client update card exposes progress, terminal state and retry feedback", () => {
  assert.match(source, /async function checkClientUpdates\(\)/);
  assert.match(source, /status: "checking"/);
  assert.match(source, /status: "error", error: message/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /updateBusy \|\| update\?\.status === "checking" \|\| update\?\.status === "downloading"/);
  assert.match(source, /Повторить проверку/);
  assert.doesNotMatch(source, /checkForUpdates\(\)\.then\(setUpdate\)/);
});
''', encoding="utf-8")
print("created test/client-update-ui.test.cjs")

for relative in ["scripts/apply-3.2.4-update-ui.py", ".github/workflows/apply-3.2.4-update-ui.yml"]:
    target = ROOT / relative
    if target.exists():
        target.unlink()
        print(f"removed {relative}")
