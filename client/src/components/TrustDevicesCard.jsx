import { useCallback, useEffect, useState } from "react";
import { Check, Fingerprint, LoaderCircle, RefreshCcw, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { listTrustDevices, revokeTrustDevice, verifyTrustDevice } from "../crypto/trust-device-management";

function fingerprint(value) {
  const compact = String(value || "").replace(/[^a-f0-9]/gi, "").toUpperCase();
  if (!compact) return "—";
  return compact.match(/.{1,4}/g)?.join(" ") || compact;
}

function relativeDate(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return "активность неизвестна";
  return new Date(value).toLocaleString("ru");
}

function statusLabel(device) {
  if (device.status === "revoked") return "отозвано";
  if (device.trustState === "verified") return "доверенное";
  if (device.trustState === "unverified") return "ожидает подтверждения";
  return device.trustState || device.status || "неизвестно";
}

export default function TrustDevicesCard({ serverId, userId, onLogout, showToast }) {
  const [devices, setDevices] = useState([]);
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await listTrustDevices();
      setCurrent(result.current);
      setDevices(result.devices);
    } catch (error) {
      setLoadError(error.code || error.message);
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  async function verify(device) {
    if (!window.confirm(`Подтвердить устройство «${device.displayName}»? Сверьте отпечаток на обоих устройствах.`)) return;
    setBusyId(device.id);
    try {
      await verifyTrustDevice(device);
      showToast("Устройство подтверждено");
      await load();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setBusyId(null);
    }
  }

  async function revoke(device) {
    const self = device.id === current?.id;
    const warning = self
      ? "Отозвать это устройство? Локальные ключи, MLS-состояние, расшифрованный кэш и защищённые черновики будут безвозвратно удалены."
      : `Отозвать устройство «${device.displayName}»? Оно немедленно потеряет доступ к новым MLS-сообщениям.`;
    if (!window.confirm(warning)) return;
    setBusyId(device.id);
    try {
      const result = await revokeTrustDevice(device, { serverId, userId });
      if (result.currentRevoked) {
        showToast("Устройство отозвано, локальные ключи удалены");
        await onLogout();
        return;
      }
      showToast("Устройство отозвано");
      await load();
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      setBusyId(null);
    }
  }

  const canVerify = current?.trustState === "verified" && current?.status === "active";
  return (
    <section className="settings-card trust-devices-card">
      <div className="settings-card-title">
        <ShieldCheck size={20} />
        <div><h3>Доверенные устройства</h3><span>Ed25519 identity и MLS KeyPackage</span></div>
        <button type="button" className="trust-refresh" onClick={load} disabled={loading} title="Обновить список" aria-label="Обновить список доверенных устройств"><RefreshCcw size={15} className={loading ? "spin" : ""} /></button>
      </div>
      {current?.trustState === "unverified" && current?.status === "active" && <div className="trust-device-warning" role="status"><ShieldAlert size={17} /><span>Это устройство ожидает подтверждения на другом уже доверенном устройстве.</span></div>}
      {loadError && <div className="trust-device-warning error" role="alert"><ShieldAlert size={17} /><span>Trust Core недоступен: {loadError}</span></div>}
      {loading && !devices.length ? <p className="settings-empty"><LoaderCircle className="spin" size={17} /> Загружаем устройства…</p> : <div className="trust-device-list">
        {devices.map((device) => {
          const active = device.status === "active";
          const pending = busyId === device.id;
          return <article className={`trust-device-row ${device.trustState || "unknown"}${active ? "" : " revoked"}`} key={device.id}>
            <div className="trust-device-main">
              <span className="trust-device-icon">{device.trustState === "verified" && active ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}</span>
              <span><strong>{device.displayName}{device.current ? " · это устройство" : ""}</strong><small>{statusLabel(device)} · последняя активность {relativeDate(device.lastSeenAt)}</small></span>
            </div>
            <div className="trust-device-fingerprint"><Fingerprint size={14} /><code title={device.fingerprint}>{fingerprint(device.fingerprint)}</code></div>
            <div className="trust-device-actions">
              {active && device.trustState === "unverified" && !device.current && <button type="button" onClick={() => verify(device)} disabled={!canVerify || pending} title={canVerify ? "Подтвердить устройство" : "Нужно доверенное текущее устройство"}>{pending ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} Подтвердить</button>}
              {active && <button type="button" className="outline-danger" onClick={() => revoke(device)} disabled={pending} title={device.current ? "Отозвать это устройство" : "Отозвать устройство"}>{pending ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />} Отозвать</button>}
            </div>
          </article>;
        })}
        {!devices.length && <p className="settings-empty">Зарегистрированных Trust-устройств нет.</p>}
      </div>}
      <p className="trust-device-note">Сервер хранит только публичные ключи и MLS-метаданные. Приватные ключи остаются в зашифрованном хранилище этого клиента.</p>
    </section>
  );
}
