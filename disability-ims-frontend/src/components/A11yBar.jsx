import { useUI } from '../context/UIContext.jsx';

// Accessibility controls (WCAG): language toggle, text resizing and
// high-contrast mode. Persisted via UIContext.
export default function A11yBar() {
  const { a, setA, t } = useUI();
  const zoom = (v) => setA({ ...a, zoom: v });
  return (
    <div className="a11y" role="region" aria-label="Accessibility settings">
      <span className="lbl">🌐 {t('lang')}</span>
      <div className="grp">
        {['en', 'rw'].map((l) => (
          <button
            key={l}
            className={a.lang === l ? 'on' : ''}
            onClick={() => setA({ ...a, lang: l })}
            aria-pressed={a.lang === l}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      <span className="lbl">🔠 {t('text')}</span>
      <div className="grp">
        <button onClick={() => zoom(Math.max(1, +(a.zoom - 0.1).toFixed(2)))} aria-label="Decrease text size">
          A−
        </button>
        <button onClick={() => zoom(1)} aria-label="Reset text size">
          A
        </button>
        <button
          onClick={() => zoom(Math.min(1.5, +(a.zoom + 0.1).toFixed(2)))}
          aria-label="Increase text size"
          style={{ fontSize: 16 }}
        >
          A+
        </button>
      </div>

      <span className="lbl">◐ {t('contrast')}</span>
      <div className="grp">
        <button className={a.hc ? 'on' : ''} onClick={() => setA({ ...a, hc: !a.hc })} aria-pressed={a.hc}>
          {a.hc ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>
  );
}
