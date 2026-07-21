import React from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    window.nexoraClient?.reportRendererError?.({
      message: String(error?.message || error || "Unknown renderer error").slice(0, 500),
      componentStack: String(info?.componentStack || "").slice(0, 4_000),
    });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="fatal-renderer-screen" role="alert">
        <section>
          <AlertTriangle size={34} />
          <span>CLIENT RECOVERY</span>
          <h1>Nexora не смогла показать этот экран</h1>
          <p>Сессия и локальные черновики сохранены. Перезагрузите интерфейс; если ошибка повторится, экспортируйте диагностику в окне подключения.</p>
          <button type="button" className="violet-button" onClick={() => window.location.reload()}>
            <RefreshCcw size={17} /> Перезагрузить интерфейс
          </button>
        </section>
      </main>
    );
  }
}
