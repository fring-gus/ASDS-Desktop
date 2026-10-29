import { useState, useEffect } from 'react'

const isElectron = !!window.electronAPI

export default function ClassesPage({ onOpenClass, theme, onToggleTheme }) {
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [thresholdTarget, setThresholdTarget] = useState(null) // { cls, semantic, lexical }
  const [thresholdSaving, setThresholdSaving] = useState(false)

  const fetchClasses = async () => {
    if (!isElectron) { setLoading(false); return }
    const data = await window.electronAPI.listClasses()
    setClasses(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchClasses() }, [])

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    const res = await window.electronAPI.createClass(name)
    if (res.success) {
      await fetchClasses()
      setShowModal(false)
      setNewName('')
    }
    setCreating(false)
  }

  const handleDelete = async (id) => {
    await window.electronAPI.deleteClass(id)
    setDeleteConfirm(null)
    fetchClasses()
  }

  const handleSaveThresholds = async () => {
    if (!thresholdTarget || !isElectron) return
    setThresholdSaving(true)
    const updated = {
      ...thresholdTarget.cls,
      semanticThreshold: parseFloat(thresholdTarget.semantic),
      lexicalThreshold: parseFloat(thresholdTarget.lexical),
    }
    await window.electronAPI.saveClass(updated)
    await fetchClasses()
    setThresholdTarget(null)
    setThresholdSaving(false)
  }

  const formatDate = (iso) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div style={s.root} className="fade-in">
      {/* Page header */}
      <div style={s.header}>
        <div>
          <h2 style={s.heading}>Your Classes</h2>
          <p style={s.subheading}>Select a class to run similarity analysis, or create a new one.</p>
        </div>
        <div style={s.headerActions}>
          <button style={s.themeToggle} onClick={onToggleTheme} title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}>
            {theme === 'light' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            )}
          </button>
          <button id="create-class-btn" className="btn btn-primary" onClick={() => setShowModal(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Class
          </button>
        </div>
      </div>

      {/* Classes grid */}
      <div style={s.body}>
        {loading ? (
          <div style={s.empty}>
            <div style={s.spinner} />
            <p style={s.emptyText}>Loading classes...</p>
          </div>
        ) : classes.length === 0 ? (
          <div style={s.empty}>
            <div style={s.emptyIcon}>📂</div>
            <p style={s.emptyTitle}>No classes yet</p>
            <p style={s.emptyText}>Create your first class to start detecting similarity.</p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowModal(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Create First Class
            </button>
          </div>
        ) : (
          <div style={s.grid}>
            {classes.map((cls, i) => (
              <ClassCard
                key={cls.id || i}
                cls={cls}
                onOpen={() => onOpenClass(cls)}
                onDelete={() => setDeleteConfirm(cls)}
                onSettings={() => setThresholdTarget({
                  cls,
                  semantic: (cls.semanticThreshold ?? 0.65).toString(),
                  lexical: (cls.lexicalThreshold ?? 0.65).toString(),
                })}
                formatDate={formatDate}
              />
            ))}
            {/* Add new card */}
            <button id="add-class-card-btn" style={s.addCard} onClick={() => setShowModal(true)}>
              <div style={s.addIconWrap}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </div>
              <span style={s.addLabel}>New Class</span>
            </button>
          </div>
        )}
      </div>

      {/* Create class modal */}
      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal-box">
            <h3 className="modal-title">Create New Class</h3>
            <label style={s.label}>Class Name</label>
            <input
              id="class-name-input"
              className="input"
              placeholder="e.g. CS101 — Assignment 3"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => { setShowModal(false); setNewName('') }}>Cancel</button>
              <button id="confirm-create-btn" className="btn btn-primary" onClick={handleCreate} disabled={!newName.trim() || creating}>
                {creating ? 'Creating...' : 'Create Class'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setDeleteConfirm(null)}>
          <div className="modal-box">
            <h3 className="modal-title">Delete Class?</h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              This will permanently delete <strong style={{ color: 'var(--text-primary)' }}>{deleteConfirm.name}</strong> and all its saved results.
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm.id)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Threshold settings modal */}
      {thresholdTarget && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setThresholdTarget(null)}>
          <div className="modal-box" style={{ maxWidth: 420 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={ts.modalIcon}>⚙️</div>
              <div>
                <h3 className="modal-title" style={{ marginBottom: 2 }}>Threshold Settings</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{thresholdTarget.cls.name}</p>
              </div>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
              Set the similarity score threshold for each analysis type. Pairs scoring above the threshold will be <strong style={{ color: 'var(--danger)' }}>flagged</strong> as suspicious.
            </p>

            {/* Semantic Section */}
            <div style={ts.section}>
              <div style={ts.sectionHeader}>
                <span style={ts.sectionIcon}>🧠</span>
                <div>
                  <div style={ts.sectionTitle}>Semantic Analysis</div>
                  <div style={ts.sectionSub}>For project &amp; seminar abstracts</div>
                </div>
              </div>
              <div style={ts.inputRow}>
                <label style={ts.label}>Flag threshold</label>
                <div style={ts.inputWrap}>
                  <input
                    id="semantic-threshold-input"
                    type="number"
                    min="0" max="100" step="1"
                    className="input"
                    style={ts.input}
                    value={Math.round(parseFloat(thresholdTarget.semantic || '0.65') * 100)}
                    onChange={e => {
                      const pct = Math.min(100, Math.max(0, parseInt(e.target.value) || 0))
                      setThresholdTarget(prev => ({ ...prev, semantic: (pct / 100).toString() }))
                    }}
                  />
                  <span style={ts.unit}>%</span>
                </div>
              </div>
              <ThresholdSlider
                value={parseFloat(thresholdTarget.semantic)}
                onChange={v => setThresholdTarget(prev => ({ ...prev, semantic: v.toString() }))}
                color="#7c5cfc"
              />
            </div>

            {/* Lexical Section */}
            <div style={ts.section}>
              <div style={ts.sectionHeader}>
                <span style={ts.sectionIcon}>📄</span>
                <div>
                  <div style={ts.sectionTitle}>Lexical Analysis</div>
                  <div style={ts.sectionSub}>For assignments &amp; text-based submissions</div>
                </div>
              </div>
              <div style={ts.inputRow}>
                <label style={ts.label}>Flag threshold</label>
                <div style={ts.inputWrap}>
                  <input
                    id="lexical-threshold-input"
                    type="number"
                    min="0" max="100" step="1"
                    className="input"
                    style={ts.input}
                    value={Math.round(parseFloat(thresholdTarget.lexical || '0.65') * 100)}
                    onChange={e => {
                      const pct = Math.min(100, Math.max(0, parseInt(e.target.value) || 0))
                      setThresholdTarget(prev => ({ ...prev, lexical: (pct / 100).toString() }))
                    }}
                  />
                  <span style={ts.unit}>%</span>
                </div>
              </div>
              <ThresholdSlider
                value={parseFloat(thresholdTarget.lexical)}
                onChange={v => setThresholdTarget(prev => ({ ...prev, lexical: v.toString() }))}
                color="#22c55e"
              />
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setThresholdTarget(null)}>Cancel</button>
              <button id="save-threshold-btn" className="btn btn-primary" onClick={handleSaveThresholds} disabled={thresholdSaving}>
                {thresholdSaving ? 'Saving...' : 'Save Thresholds'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ThresholdSlider({ value, onChange, color }) {
  const pct = Math.round(value * 100)
  return (
    <div style={{ marginTop: 8 }}>
      <input
        type="range"
        min="0" max="100" step="1"
        value={pct}
        onChange={e => onChange(parseInt(e.target.value) / 100)}
        style={{
          width: '100%',
          accentColor: color,
          cursor: 'pointer',
          height: 4,
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
        <span>0%</span>
        <span style={{ color, fontWeight: 700 }}>{pct}%</span>
        <span>100%</span>
      </div>
    </div>
  )
}

function ClassCard({ cls, onOpen, onDelete, onSettings, formatDate }) {
  const fileCount = cls.file_paths?.length || 0
  
  const activeResults = cls.mode === 'lexical' 
    ? (cls.lexicalResults || cls.results || [])
    : (cls.semanticResults || cls.results || [])

  const resultCount = activeResults.length
  const flaggedCount = activeResults.filter(r => r.is_flagged).length

  return (
    <div className="card" style={s.card}>
      <div style={s.cardTop}>
        <div style={s.classIcon}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn btn-icon" style={s.settingsBtn} onClick={(e) => { e.stopPropagation(); onSettings() }} title="Threshold Settings">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          <button className="btn btn-icon btn-danger" onClick={(e) => { e.stopPropagation(); onDelete() }} title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6M14 11v6M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      </div>

      <div style={s.cardBody} onClick={onOpen}>
        <h3 style={s.className}>{cls.name}</h3>
        <div style={s.cardMeta}>
          <span style={s.metaItem}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            {formatDate(cls.created_at)}
          </span>
          {cls.last_analyzed && (
            <span style={s.metaItem}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Last run {formatDate(cls.last_analyzed)}
            </span>
          )}
        </div>

        <div style={s.cardStats}>
          <div style={s.stat}>
            <span style={s.statVal}>{fileCount}</span>
            <span style={s.statLabel}>Files</span>
          </div>
          <div style={s.statDiv} />
          <div style={s.stat}>
            <span style={s.statVal}>{resultCount}</span>
            <span style={s.statLabel}>Pairs</span>
          </div>
          <div style={s.statDiv} />
          <div style={s.stat}>
            <span style={{ ...s.statVal, color: flaggedCount > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{flaggedCount}</span>
            <span style={s.statLabel}>Flagged</span>
          </div>
        </div>
      </div>

      <button className="btn btn-primary" style={s.openBtn} onClick={onOpen} id={`open-class-${cls.id}`}>
        Open Class
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </button>
    </div>
  )
}

const s = {
  root: {
    height: 'calc(100vh - 44px)',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: 'radial-gradient(ellipse 70% 40% at 50% 0%, rgba(99, 102, 241, 0.06) 0%, transparent 60%), var(--bg-base)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '28px 36px 20px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
  },
  heading: {
    fontSize: 22,
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: 4,
  },
  subheading: {
    fontSize: 13,
    color: 'var(--text-secondary)',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  themeToggle: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
    borderRadius: '50%',
  },
  body: {
    flex: 1,
    overflow: 'auto',
    padding: '28px 36px',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: 12,
    minHeight: 300,
  },
  emptyIcon: {
    fontSize: 52,
    marginBottom: 4,
    filter: 'grayscale(0.3)',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: 'var(--text-secondary)',
  },
  emptyText: {
    fontSize: 13,
    color: 'var(--text-muted)',
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid rgba(99, 102, 241, 0.2)',
    borderTop: '3px solid var(--accent)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 16,
  },
  card: {
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    cursor: 'default',
  },
  cardTop: {
    display: 'flex',
    alignItems: 'center',
  },
  classIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
    background: 'rgba(99, 102, 241, 0.1)',
    border: '1px solid rgba(99, 102, 241, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--accent-light)',
    flexShrink: 0,
  },
  cardBody: {
    cursor: 'pointer',
    flex: 1,
  },
  className: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text-primary)',
    marginBottom: 8,
    lineHeight: 1.3,
  },
  cardMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    marginBottom: 16,
  },
  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    color: 'var(--text-muted)',
  },
  cardStats: {
    display: 'flex',
    gap: 0,
    background: 'rgba(0,0,0,0.02)',
    borderRadius: 10,
    border: '1px solid var(--border)',
    overflow: 'hidden',
    padding: '10px 0',
  },
  stat: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  statVal: {
    fontSize: 18,
    fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--text-primary)',
  },
  statLabel: {
    fontSize: 10,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  statDiv: {
    width: 1,
    background: 'var(--border)',
    margin: '0 0',
  },
  openBtn: {
    width: '100%',
  },
  addCard: {
    background: 'var(--bg-surface)',
    border: '1.5px dashed rgba(99, 102, 241, 0.3)',
    borderRadius: 18,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: '40px 20px',
    cursor: 'pointer',
    color: 'rgba(99, 102, 241, 0.5)',
    transition: 'all 0.2s ease',
    minHeight: 200,
    fontFamily: 'inherit',
  },
  addIconWrap: {
    width: 50,
    height: 50,
    borderRadius: '50%',
    background: 'rgba(99, 102, 241, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: 'rgba(99, 102, 241, 0.6)',
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  settingsBtn: {
    color: 'var(--accent-light)',
    background: 'var(--accent-dim)',
    border: '1px solid rgba(124,92,252,0.2)',
  },
}

// Threshold modal styles
const ts = {
  modalIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    background: 'var(--accent-dim)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    flexShrink: 0,
  },
  section: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '14px 16px',
    marginBottom: 12,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sectionIcon: {
    fontSize: 18,
    width: 28,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  sectionSub: {
    fontSize: 11,
    color: 'var(--text-muted)',
    marginTop: 1,
  },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
  },
  inputWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  input: {
    width: 68,
    textAlign: 'center',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 14,
    fontWeight: 700,
    padding: '6px 8px',
  },
  unit: {
    fontSize: 13,
    color: 'var(--text-muted)',
    fontFamily: "'JetBrains Mono', monospace",
  },
}
