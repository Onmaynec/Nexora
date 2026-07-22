import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, Sparkles, X } from "lucide-react";

export default function ReleaseAnnouncement() {
  const [notes, setNotes] = useState(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeRef = useRef(null);

  useEffect(() => {
    let active = true;
    window.nexoraClient?.getReleaseNotes?.()
      .then((value) => { if (active && value) setNotes(value); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!notes) return undefined;
    closeRef.current?.focus();
    const onKeyDown = (event) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [notes, dontShowAgain]);

  async function close() {
    if (!notes || closing) return;
    setClosing(true);
    try { await window.nexoraClient?.dismissReleaseNotes?.(notes.version, dontShowAgain); }
    finally { setNotes(null); setClosing(false); }
  }

  async function details() {
    if (notes) await window.nexoraClient?.openReleaseNotes?.(notes.version);
  }

  if (!notes) return null;
  return (
    <div className="release-announcement" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="release-announcement-card" role="dialog" aria-modal="true" aria-labelledby="release-announcement-title" aria-describedby="release-announcement-summary">
        <div className="release-announcement-glow" aria-hidden="true" />
        <header>
          <span className="release-announcement-icon"><Sparkles size={22} /></span>
          <div><span className="release-announcement-kicker">ОБНОВЛЕНИЕ УСТАНОВЛЕНО · {notes.version}</span><h2 id="release-announcement-title">{notes.title}</h2></div>
          <button ref={closeRef} type="button" className="release-announcement-x" onClick={close} aria-label="Закрыть"><X size={19} /></button>
        </header>
        <p id="release-announcement-summary" className="release-announcement-summary">{notes.summary}</p>
        <div className="release-announcement-list">{notes.highlights.map((item) => <div key={item}><CheckCircle2 size={17} /><span>{item}</span></div>)}</div>
        <footer>
          <label className="release-announcement-check"><input type="checkbox" checked={dontShowAgain} onChange={(event) => setDontShowAgain(event.target.checked)} /><span>Не показывать снова</span></label>
          <div><button type="button" className="release-secondary" onClick={details}><ExternalLink size={16} /> Подробнее</button><button type="button" className="release-primary" onClick={close} disabled={closing}>{closing ? "Закрываем…" : "Закрыть"}</button></div>
        </footer>
      </section>
    </div>
  );
}
