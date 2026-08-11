import { Component } from 'react';

// ─────────────────────────────────────────────────────────────
// Last line of defence. Without a boundary, one exception thrown anywhere
// in the tree unmounts the whole application and leaves a blank white page:
// no message, no way back, and nothing on screen for a user with a
// cognitive impairment or a screen reader to act on. A caught error at
// least states what happened and offers a way out of it.
//
// It has to be a class — React exposes no hook equivalent of
// componentDidCatch.
// ─────────────────────────────────────────────────────────────
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Kept in the console rather than sent anywhere: a crash report from this
    // app could contain a beneficiary's name or national ID, which must not
    // leave the district's own infrastructure without a decision to send it.
    console.error('Unhandled UI error:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{ maxWidth: 620, margin: '10vh auto', padding: 24 }}>
        <div className="card">
          <div style={{ fontSize: 34 }} aria-hidden="true">⚠️</div>
          <h1 className="card-t" style={{ marginTop: 8, fontSize: 20 }}>
            Something went wrong · Hari ikitagenze neza
          </h1>
          <p className="page-sub">
            The page could not be displayed. Nothing you had already saved has been lost — the
            error happened while drawing the screen, not while writing to the registry.
            <br />
            Urupapuro ntirwashoboye kwerekanwa. Ibyo wari wabitse ntibyapfuye.
          </p>

          <div className="rec" style={{ marginTop: 14 }}>
            <div className="rl">Technical detail</div>
            <code style={{ fontSize: 12.5, wordBreak: 'break-word' }}>{error.message}</code>
          </div>

          <div className="row-actions">
            <button className="btn" onClick={() => window.location.reload()}>
              Reload the page · Ongera ufungure
            </button>
            <button
              className="btn ghost"
              onClick={() => { window.location.href = '/'; }}
            >
              Back to my dashboard · Subira ku ibaruwa
            </button>
          </div>
        </div>
      </div>
    );
  }
}
