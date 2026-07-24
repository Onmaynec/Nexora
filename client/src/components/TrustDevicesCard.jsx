import { useCallback, useEffect, useState } from "react";
import { Laptop, LoaderCircle, LogOut, RefreshCcw, ShieldAlert, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { api, remove } from "../api";

function relativeDate(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return "активность неизвестна";
  return new Date(value).toLocaleString("ru");
}

function DeviceIcon({ platform }) {
  return /android|ios|mobile/i.test(String(platform || "")) ? <Smartphone size={18} /> : <Laptop size={18} />;
}

export default function TrustDevicesCard({ showToast }) {
  const [devices, setDevices] = useState([]);
  const [currentDeviceId, setCurrentDeviceId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await api("/api/v3/devices");
      setCurrentDeviceId(result.currentDeviceId || null);
      setDevices(result.devices || []);
    } catch (error) {
      setLoadError(error.code || error.message);
      showToast(error.message, "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  async function revoke(device) {
    if (device.current || device.deviceId === currentDeviceId) return;
    if (!window.confirm(`Отозвать устройство «${device.name}»? Все его сессии немедленно потеряют REST и realtime-доступ.`)) return;
    setBusyId(device.deviceId);
    try {
      await remove(`/api/v3/devices/${encodeURIComponent(device.deviceId)}/sessions`);
      showToast("Устройство отозвано");
      await load();
    } catch (error) {
      showToast(`${error.message}${error.requestId ? ` · requestId ${error.requestId}` : ""}`, "error");
    } finally {
      setBusyId(null);
    }
  }

  async function revokeOthers() {
    if (!window.confirm("Завершить все сессии на других устройствах? Текущее устройство останется подключено.")) return;
    setBusyId("others");
    try {
      const result = await remove("/api/v3/devices/sessions/others");
      showToast(`Завершено сессий: ${result.revokedSessions || 0}`);
      await load();
    } catch (error) {
      showToast(`${error.message}${error.requestId ? ` · requestId ${error.requestId}` : ""}`, "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="settings-card trust-devices-card">
      <div className="settings-card-title">
        <ShieldCheck size={20} />
        <div><h3>Устройства и сессии</h3><span>Управляются Local Server</span></div>
        <button type="button" className="trust-refresh" onClick={load} disabled={loading} title="Обновить список" aria-label="Обновить список устройств"><RefreshCcw size={15} className={loading ? "spin" : ""} /></button>
      </div>
      {loadError && <div className="trust-device-warning error" role="alert"><ShieldAlert size={17} /><span>Device inventory недоступен: {loadError}</span></div>}
      {loading && !devices.length ? <p className="settings-empty"><LoaderCircle className="spin" size={17} /> Загружаем устройства…</p> : <div className="trust-device-list">
        {devices.map((device) => {
          const pending = busyId === device.deviceId;
          return <article className={`trust-device-row${device.current ? " verified" : ""}`} key={device.deviceId}>
            <div className="trust-device-main">
              <span className="trust-device-icon"><DeviceIcon platform={device.platform} /></span>
              <span><strong>{device.name}{device.current ? " · это устройство" : ""}</strong><small>{device.platform || "unknown"}{device.version ? ` · Nexora ${device.version}` : ""} · последняя активность {relativeDate(device.lastSeenAt)}</small></span>
            </div>
            <div className="trust-device-fingerprint"><code title={device.deviceId}>{device.deviceId}</code><small>{device.sessionCount} активн. сесс.</small></div>
            <div className="trust-device-actions">
              {!device.current && <button type="button" className="outline-danger" onClick={() => revoke(device)} disabled={pending} title="Отозвать все сессии устройства">{pending ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />} Отозвать</button>}
              {device.current && <span className="trust-current-session"><ShieldCheck size={15} /> Активно</span>}
            </div>
          </article>;
        })}
        {!devices.length && <p className="settings-empty">Активных устройств нет.</p>}
      </div>}
      <button type="button" className="outline-danger" onClick={revokeOthers} disabled={busyId === "others" || devices.filter((device) => !device.current).length === 0}>{busyId === "others" ? <LoaderCircle className="spin" size={15} /> : <LogOut size={15} />} Завершить сессии на других устройствах</button>
      <p className="trust-device-note">Trust/MLS runtime удалён. Список формируется из серверных сессий; отзыв немедленно закрывает REST и Socket.IO-доступ.</p>
    </section>
  );
}
