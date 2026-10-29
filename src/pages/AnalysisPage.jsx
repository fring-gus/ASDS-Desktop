import { useState, useEffect, useRef } from 'react'
import ResultsPanel from '../components/ResultsPanel'

const isElectron = !!window.electronAPI

export default function AnalysisPage({ classData, onBack, stateCache }) {
  // 1. Initialize state from cache OR classData
  const [state, setState] = useState(() => {
    if (stateCache && stateCache.has(classData.id)) {
      const cached = stateCache.get(classData.id)
      if (cached.running && !cached.promise) {
        return { ...cached, running: false, progress: null, activeRequestId: null }
      }
      return cached
    }
    // Backward compatibility with older 'results' format
    const legacyResults = classData?.results || []
    const legacyMode = classData?.mode || 'semantic'

    return {
      files: classData?.file_paths || [],
      analysisMode: legacyMode,
      running: false,
      progress: null,
      semanticResults: classData?.semanticResults || (legacyMode === 'semantic' ? legacyResults : []),
      lexicalResults: classData?.lexicalResults || (legacyMode === 'lexical' ? legacyResults : []),
      filenames: classData?.filenames || [],
      error: null,
      promise: null,
      activeRequestId: null
    }
  })

  const { files, running, analysisMode, progress, semanticResults, lexicalResults, filenames, error } = state

  // Per-class thresholds (default 0.65 = 65%)
  const semanticThreshold = classData?.semanticThreshold ?? 0.65
  const lexicalThreshold = classData?.lexicalThreshold ?? 0.65
  const activeThreshold = analysisMode === 'semantic' ? semanticThreshold : lexicalThreshold

  // Apply threshold override: re-flag results based on user-set threshold
  const applyThreshold = (results, threshold) =>
    results.map(r => ({
      ...r,
      is_flagged: (r.mode === 'semantic' ? r.semantic_score : r.tfidf_score) >= threshold,
    }))

  const rawResults = analysisMode === 'semantic' ? semanticResults : lexicalResults
  const activeResults = applyThreshold(rawResults, activeThreshold)

  const [dragging, setDragging] = useState(false)
  const dropRef = useRef(null)
  const progressUnsubRef = useRef(null)

  const updateState = (updater) => {
    setState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
      if (stateCache) stateCache.set(classData.id, next)
      return next
    })
  }

  // 1. Progress listener
  useEffect(() => {
    if (!isElectron) return
    
    progressUnsubRef.current = window.electronAPI.onAnalysisProgress((data) => {
      const cached = stateCache?.get(classData.id)
      if (!cached?.running || !cached.activeRequestId || data.req_id !== cached.activeRequestId) {
        return
      }
      updateState(prev => ({
        ...prev,
        progress: { percent: data.percent, msg: data.msg }
      }))
    })

    return () => { 
      if (progressUnsubRef.current) progressUnsubRef.current()
    }
  }, [])

  // 4. Restore promise functionality on remount
  useEffect(() => {
    let isSubscribed = true
    if (running && state.promise) {
      state.promise.then(() => {
        // Delay slightly to let the persistent handler update the cache first
        setTimeout(() => {
          if (!isSubscribed) return
          if (stateCache && stateCache.has(classData.id)) {
             setState(stateCache.get(classData.id))
          }
        }, 10)
      })
    }
    return () => { isSubscribed = false }
  }, [running, state.promise, classData.id, stateCache])

  const handleAddFiles = async () => {
    if (running) return
    if (!isElectron) return alert('File dialog only available in Electron app.')
    const paths = await window.electronAPI.openFileDialog()
    if (paths?.length) {
      updateState(prev => {
        const existing = new Set(prev.files)
        const newFiles = paths.filter(p => !existing.has(p))
        return { ...prev, files: [...prev.files, ...newFiles] }
      })
    }
  }

  const handleRemoveFile = (idx) => {
    if (running) return
    updateState(prev => ({ ...prev, files: prev.files.filter((_, i) => i !== idx) }))
  }

  // Drag and drop
  const handleDragOver = (e) => { e.preventDefault(); setDragging(true) }
  const handleDragLeave = () => setDragging(false)
  const handleDrop = (e) => {
    e.preventDefault()
    if (running) return
    setDragging(false)
    const dropped = Array.from(e.dataTransfer.files)
      .filter(f => f.name.endsWith('.pdf') || f.name.endsWith('.docx'))
      .map(f => f.path)
    if (dropped.length) {
      updateState(prev => {
        const existing = new Set(prev.files)
        return { ...prev, files: [...prev.files, ...dropped.filter(p => !existing.has(p))] }
      })
    }
  }

  const setAnalysisMode = (mode) => {
    if (running) return
    updateState(prev => ({ ...prev, analysisMode: mode }))
  }

  const handleRun = () => {
    if (files.length < 2) {
      updateState(prev => ({...prev, error: 'Please add at least 2 documents to compare.'}))
      return
    }
    if (!isElectron) {
      updateState(prev => ({...prev, error: 'Analysis only available in Electron app.'}))
      return
    }

    const requestId = `req_${classData.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const runFiles = [...files]
    const runMode = analysisMode
    const runThreshold = activeThreshold
    const runPromise = window.electronAPI.runAnalysis({
      filePaths: runFiles,
      mode: runMode,
      threshold: runThreshold,
      requestId
    })

    // Persistent background handler for caching and disk saving
    runPromise.then(res => {
      const currentCache = stateCache.get(classData.id) || {}
      if (!res.success) {
         const isCanceled = res.canceled || (res.error && res.error.toLowerCase().includes('cancel'))
         const finalObj = { 
           ...currentCache, 
           running: false, 
           progress: null, 
           error: isCanceled ? null : (res.error || 'Analysis failed.'), 
           promise: null,
           activeRequestId: null
         }
         stateCache.set(classData.id, finalObj)
         setState(finalObj)
      } else {
         const finalObj = {
           ...currentCache,
           running: false,
           progress: null,
           error: null,
           semanticResults: runMode === 'semantic' ? res.results : (currentCache.semanticResults || semanticResults),
           lexicalResults: runMode === 'lexical' ? res.results : (currentCache.lexicalResults || lexicalResults),
           filenames: res.filenames,
           promise: null,
           activeRequestId: null
         }
         stateCache.set(classData.id, finalObj)
         setState(finalObj)

         if (classData?.id) {
           const updated = {
             ...classData,
             file_paths: runFiles,
             filenames: res.filenames,
             semanticResults: finalObj.semanticResults,
             lexicalResults: finalObj.lexicalResults,
             mode: runMode,
             last_analyzed: new Date().toISOString(),
           }
           window.electronAPI.saveClass(updated)
         }
      }
    })

    updateState(prev => ({
      ...prev,
      running: true,
      error: null,
      progress: { percent: 0, msg: 'Starting...' },
      promise: runPromise,
      activeRequestId: requestId
      // Note: We don't clear the results immediately upon clicking Run. We let them stay visible under loading!
    }))
  }

  const handleCancel = async () => {
    if (!isElectron) return
    await window.electronAPI.cancelAnalysis()
  }

  const handleExport = async () => {
    if (!isElectron) return
    const res = await window.electronAPI.exportExcel({ results: activeResults, filenames })
    if (!res.success && !res.canceled) {
      updateState(prev => ({ ...prev, error: res.error || 'Export failed.' }))
    }
  }

  const basename = (fp) => fp.replace(/\\/g, '/').split('/').pop()

  return (
    <div style={s.root}>
      {/* Left panel — file selection */}
      <div style={s.leftPanel} className="fade-in">
        {/* Page Title */}
        <div style={s.panelHeader}>
          <div style={s.panelIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <div>
            <div style={s.panelTitle}>{classData?.name || 'Analysis'}</div>
            <div style={s.panelSub}>Select documents to compare</div>
          </div>
        </div>

        {/* Mode Selector */}
        <div style={s.modeSelector}>
          <div style={s.modeLabel}>Analysis Mode</div>
          <div style={s.modeCards}>
            <div 
              style={{ ...s.modeCard, ...(analysisMode === 'semantic' ? s.modeCardActive : {}) }}
              onClick={() => setAnalysisMode('semantic')}
            >
              <div style={s.modeIcon}>🧠</div>
              <div style={s.modeInfo}>
                <div style={s.modeTitle}>Semantic Analysis</div>
                <div style={s.modeSub}>For project abstracts and seminar abstracts</div>
              </div>
            </div>
            <div 
              style={{ ...s.modeCard, ...(analysisMode === 'lexical' ? s.modeCardActive : {}) }}
              onClick={() => setAnalysisMode('lexical')}
            >
              <div style={s.modeIcon}>📄</div>
              <div style={s.modeInfo}>
                <div style={s.modeTitle}>Lexical Analysis</div>
                <div style={s.modeSub}>For assignments and text-based submissions</div>
              </div>
            </div>
          </div>
        </div>

        {/* File Section (Drop Zone + File List) */}
        <div style={s.fileSectionContainer}>
          {/* Drop zone */}
          <div
            ref={dropRef}
            style={{
              ...s.dropZone,
              ...(dragging ? s.dropZoneDrag : {}),
            }}
            onClick={handleAddFiles}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            id="file-drop-zone"
          >
            <div style={s.dropIcon}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <p style={s.dropTitle}>Click or drag &amp; drop files</p>
            <p style={s.dropSub}>Supports PDF and DOCX files</p>
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div style={s.fileList}>
              <div style={s.fileListHeader}>
                <span style={s.fileListLabel}>Selected Files</span>
                <span style={s.fileListCount}>{files.length}</span>
              </div>
              <div style={s.fileItems}>
                {files.map((fp, i) => (
                  <div key={fp} style={s.fileItem} className="slide-up">
                    <div style={s.fileIcon}>
                      {fp.endsWith('.pdf') ? '📄' : '📝'}
                    </div>
                    <div style={s.fileName} title={fp}>{basename(fp)}</div>
                    <button
                      style={s.removeBtn}
                      onClick={() => handleRemoveFile(i)}
                      title="Remove"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={s.errorBox}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {error}
          </div>
        )}

        {/* Progress */}
        {running && progress && (
          <div style={s.progressWrap}>
            <div style={s.progressHeader}>
              <span style={s.progressMsg}>{progress.msg}</span>
              <span style={s.progressPct}>{progress.percent}%</span>
            </div>
            <div className="progress-bar-track">
              <div className="progress-bar-fill" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={s.actions}>
          <button
            id="run-similarity-btn"
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={handleRun}
            disabled={running || files.length < 2}
          >
            {running ? (
              <>
                <div style={s.btnSpinner} />
                Analyzing...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Run Similarity
              </>
            )}
          </button>
          {running && (
            <button className="btn btn-secondary" style={{ flexShrink: 0, color: 'var(--danger)' }} onClick={handleCancel} title="Cancel Analysis">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
              Cancel
            </button>
          )}
          {activeResults.length > 0 && !running && (
            <button className="btn btn-secondary" style={{ flexShrink: 0 }} onClick={handleExport} title="Export to Excel">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export
            </button>
          )}
        </div>
      </div>

      {/* Right panel — results */}
      <div style={s.rightPanel}>
        {activeResults.length === 0 && !running ? (
          <div style={s.noResults}>
            <div style={s.noResultsIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
              </svg>
            </div>
            <p style={s.noResultsTitle}>No Results Yet</p>
            <p style={s.noResultsText}>Add documents and click Run Similarity to start analysis.</p>
          </div>
        ) : running ? (
          <div style={s.noResults}>
            <div style={{ ...s.spinner, width: 44, height: 44, borderWidth: 4 }} />
            <p style={s.noResultsTitle}>Analyzing Documents...</p>
            <p style={s.noResultsText}>{progress?.msg || 'Please wait, this may take a while.'}</p>
          </div>
        ) : (
          <ResultsPanel
            results={activeResults}
            filenames={filenames}
            mode={analysisMode}
            semanticThreshold={semanticThreshold}
            lexicalThreshold={lexicalThreshold}
          />
        )}
      </div>
    </div>
  )
}

const s = {
  root: {
    height: 'calc(100vh - 44px)',
    width: '100%',
    display: 'flex',
    overflow: 'hidden',
    background: 'var(--bg-base)',
  },
  leftPanel: {
    width: 340,
    height: '100%',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    padding: 24,
    borderRight: '1px solid var(--border)',
    overflow: 'hidden', // Ensures scroll only happens in intended child areas
    background: 'var(--bg-surface)',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
  },
  panelIcon: {
    width: 40,
    height: 40,
    background: 'var(--accent-dim)',
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--accent-light)',
    flexShrink: 0,
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  panelSub: {
    fontSize: 11,
    color: 'var(--text-muted)',
    marginTop: 2,
  },
  modeSelector: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    flexShrink: 0,
  },
  modeLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  modeCards: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  modeCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    borderRadius: 10,
    border: '2px solid transparent',
    background: 'var(--bg-card)',
    boxShadow: 'var(--shadow-card)',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  modeCardActive: {
    border: '2px solid var(--accent)',
    background: 'var(--accent-dim)',
  },
  modeIcon: {
    fontSize: 20,
  },
  modeInfo: {
    display: 'flex',
    flexDirection: 'column',
  },
  modeTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  modeSub: {
    fontSize: 11,
    color: 'var(--text-muted)',
    marginTop: 2,
  },
  fileSectionContainer: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  dropZone: {
    border: '2px dashed rgba(99, 102, 241, 0.3)',
    borderRadius: 14,
    padding: '24px 16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    background: 'rgba(99, 102, 241, 0.03)',
    transition: 'all 0.2s ease',
    flexShrink: 0,
  },
  dropZoneDrag: {
    border: '2px dashed var(--accent)',
    background: 'var(--accent-dim)',
    boxShadow: '0 0 20px var(--accent-glow)',
  },
  dropIcon: {
    color: 'var(--accent)',
    opacity: 0.6,
    marginBottom: 4,
  },
  dropTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--text-secondary)',
  },
  dropSub: {
    fontSize: 11,
    color: 'var(--text-muted)',
  },
  fileList: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  fileListHeader: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: 8,
    flexShrink: 0,
  },
  fileListLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  fileListCount: {
    marginLeft: 'auto',
    background: 'var(--accent-dim)',
    color: 'var(--accent-light)',
    borderRadius: 10,
    padding: '1px 8px',
    fontSize: 11,
    fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace",
  },
  fileItems: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    paddingRight: 4, // for smooth scrollability styling
  },
  fileItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'var(--bg-card)',
    boxShadow: 'var(--shadow-card)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '8px 10px',
    flexShrink: 0,
  },
  fileIcon: {
    fontSize: 14,
    flexShrink: 0,
  },
  fileName: {
    flex: 1,
    fontSize: 12,
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: "'JetBrains Mono', monospace",
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: 4,
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    transition: 'color 0.15s',
  },
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'var(--danger-dim)',
    border: '1px solid rgba(224,85,85,0.25)',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 12,
    color: 'var(--danger)',
    flexShrink: 0,
  },
  progressWrap: {
    background: 'var(--bg-card)',
    boxShadow: 'var(--shadow-card)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    flexShrink: 0,
  },
  progressHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressMsg: {
    fontSize: 11,
    color: 'var(--text-secondary)',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  progressPct: {
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    color: 'var(--accent-light)',
    marginLeft: 8,
  },
  actions: {
    display: 'flex',
    gap: 10,
    flexShrink: 0,
  },
  btnSpinner: {
    width: 14,
    height: 14,
    border: '2px solid rgba(255,255,255,0.3)',
    borderTop: '2px solid #fff',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  rightPanel: {
    flex: 1,
    height: '100%',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  noResults: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    color: 'var(--text-muted)',
  },
  noResultsIcon: {
    color: 'rgba(99, 102, 241, 0.2)',
    marginBottom: 4,
  },
  noResultsTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: 'var(--text-secondary)',
  },
  noResultsText: {
    fontSize: 13,
    color: 'var(--text-muted)',
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 1.6,
  },
  spinner: {
    width: 36,
    height: 36,
    border: '3px solid rgba(99, 102, 241, 0.2)',
    borderTop: '3px solid var(--accent)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
}
