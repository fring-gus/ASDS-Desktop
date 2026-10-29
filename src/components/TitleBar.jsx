export default function TitleBar({ onBack, currentPage }) {
  const isElectron = !!window.electronAPI

  const titles = {
    classes: 'Classes',
    analysis: 'Document Analysis',
  }

  return (
    <div className="titlebar">
      <div className="titlebar-drag" />

      <div className="titlebar-left">
        <div className="titlebar-logo">
          <span className="titlebar-logo-text">ASDS</span>
        </div>
        {onBack && (
          <button className="titlebar-back btn btn-ghost" onClick={onBack}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Back
          </button>
        )}
        <span className="titlebar-current">{titles[currentPage]}</span>
      </div>

      {isElectron && (
        <div className="titlebar-controls">
          <button className="titlebar-btn" onClick={() => window.electronAPI.minimizeWindow()} title="Minimize">
            <svg width="10" height="10" viewBox="0 0 10 10"><rect y="4.5" width="10" height="1" fill="currentColor"/></svg>
          </button>
          <button className="titlebar-btn" onClick={() => window.electronAPI.maximizeWindow()} title="Maximize">
            <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor"/></svg>
          </button>
          <button className="titlebar-btn titlebar-btn-close" onClick={() => window.electronAPI.closeWindow()} title="Close">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2"/>
              <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
          </button>
        </div>
      )}

      <style>{`
        .titlebar {
          height: 44px;
          background: var(--bg-header, var(--bg-surface));
          border-bottom: 1px solid rgba(0, 0, 0, 0.1);
          display: flex;
          align-items: center;
          padding: 0 8px 0 16px;
          flex-shrink: 0;
          position: relative;
          z-index: 100;
          -webkit-app-region: drag;
          user-select: none;
        }
        .titlebar-drag {
          position: absolute;
          inset: 0;
          -webkit-app-region: drag;
          pointer-events: none;
        }
        .titlebar-left {
          display: flex;
          align-items: center;
          gap: 12px;
          -webkit-app-region: no-drag;
        }
        .titlebar-logo {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .titlebar-logo-text {
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 2px;
          color: var(--text-header, var(--accent-light));
          font-family: var(--font-mono);
        }
        .titlebar-back {
          padding: 4px 10px;
          font-size: 12px;
          height: 28px;
          color: var(--text-header-muted, var(--text-secondary));
          -webkit-app-region: no-drag;
        }
        .titlebar-current {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-header-muted, var(--text-secondary));
        }
        .titlebar-controls {
          display: flex;
          align-items: center;
          gap: 0;
          margin-left: auto;
          -webkit-app-region: no-drag;
        }
        .titlebar-btn {
          width: 40px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: none;
          color: var(--text-header-muted, var(--text-muted));
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }
        .titlebar-btn:hover {
          background: rgba(255, 255, 255, 0.15);
          color: var(--text-header, var(--text-primary));
        }
        .titlebar-btn-close:hover {
          background: var(--danger);
          color: #fff;
        }
      `}</style>
    </div>
  )
}
