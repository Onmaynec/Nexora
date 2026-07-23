from __future__ import annotations

import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
PATH = ROOT / "client/src/crypto/trust-client.js"
source = PATH.read_text(encoding="utf-8")


def replace_once(old: str, new: str) -> None:
    global source
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"trust-client.js: expected one occurrence, found {count}: {old[:140]!r}")
    source = source.replace(old, new, 1)


replace_once(
    '''async function requestWelcomeAndWait(device, conversationId) {
  await trustApi("/conversations/" + encodeURIComponent(conversationId) + "/welcome/request", { method: "POST", deviceId: device.id, body: {} });''',
    '''async function requestWelcomeAndWait(device, conversationId, { forceRejoin = false } = {}) {
  await trustApi("/conversations/" + encodeURIComponent(conversationId) + "/welcome/request", { method: "POST", deviceId: device.id, body: { forceRejoin } });''',
)

replace_once(
    '''  } else if (!local) {
    const joined = await claimWelcomeSafely(device, conversation.id);
    local = joined || await loadLocalGroup(conversation.id) || await requestWelcomeAndWait(device, conversation.id);
    if (!local) {
      const member = (remote.members || []).find((item) => item.deviceId === device.id && item.status === "active");
      throw Object.assign(new Error(member ? "Локальное MLS-состояние утрачено. Отзовите это устройство и подключите новое." : "Устройство ожидает MLS Welcome от активного участника."), { code: member ? "MLS_STATE_LOST" : "MLS_WELCOME_PENDING" });
    }
  }

  local = await syncMissedCommits(local, remote, device);''',
    '''  } else if (!local) {
    const activeMember = (remote.members || []).find((item) => item.deviceId === device.id && item.status === "active");
    const joined = await claimWelcomeSafely(device, conversation.id);
    local = joined || await loadLocalGroup(conversation.id);
    if (!local) local = await requestWelcomeAndWait(device, conversation.id, { forceRejoin: Boolean(activeMember) });
    if (!local) {
      throw Object.assign(new Error(activeMember
        ? "Безопасное восстановление MLS запрошено. Нужен другой активный участник или подтверждённое устройство для выдачи нового Welcome."
        : "Устройство ожидает MLS Welcome от активного участника."), { code: activeMember ? "MLS_RECOVERY_PENDING" : "MLS_WELCOME_PENDING" });
    }
  }

  try {
    local = await syncMissedCommits(local, remote, device);
  } catch (error) {
    const recoverable = new Set(["MLS_COMMIT_GAP", "MLS_COMMIT_LOG_INVALID", "MLS_PUBLIC_STATE_HASH_MISMATCH", "MLS_EPOCH_CONFLICT", "MLS_STATE_LOST"]);
    if (!recoverable.has(error?.code || error?.message)) throw error;
    const recovered = await requestWelcomeAndWait(device, conversation.id, { forceRejoin: true });
    if (!recovered) throw Object.assign(new Error("Безопасное восстановление MLS ожидает Welcome от другого активного участника."), { code: "MLS_RECOVERY_PENDING" });
    local = recovered;
    remote = (await trustApi(`/conversations/${encodeURIComponent(conversation.id)}/group`, { deviceId: device.id })).group;
  }''',
)

replace_once(
    '    if (["MLS_WELCOME_PENDING", "MLS_STATE_LOST"].includes(error.code)) return false;',
    '    if (["MLS_WELCOME_PENDING", "MLS_STATE_LOST", "MLS_RECOVERY_PENDING"].includes(error.code)) return false;',
)

PATH.write_text(source, encoding="utf-8")
print("Nexora 3.3.3 MLS client fixups applied.")
