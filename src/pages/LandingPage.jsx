import { useEffect, useRef, useState } from 'react'

const isElectron = !!window.electronAPI

export default function LandingPage({ onStart }) {
  const canvasRef = useRef(null)
  
  const [setupRequired, setSetupRequired] = useState(false)
  const [setupRunning, setSetupRunning] = useState(false)
  const [setupLog, setSetupLog] = useState('Ready to install core AI components...')

  useEffect(() => {
    if (!isElectron) return
    window.electronAPI.checkSetupRequired().then(req => setSetupRequired(req))

    const unsubLog = window.electronAPI.onSetupLog(text => setSetupLog(text))
    const unsubComplete = window.electronAPI.onSetupComplete(() => {
      setSetupRequired(false)
      setSetupRunning(false)
    })

    return () => { unsubLog(); unsubComplete() }
  }, [])

  const handleStartSetup = async () => {
    setSetupRunning(true)
    const res = await window.electronAPI.startSetup()
    if (!res.success) {
      setSetupLog('Setup Failed: ' + res.error)
      setSetupRunning(false)
    }
  }

  // Animated particle background
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let w = canvas.width = window.innerWidth
    let h = canvas.height = window.innerHeight
    let animId

    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.5 + 0.5,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      alpha: Math.random() * 0.5 + 0.1,
    }))

    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      for (const p of particles) {
        p.x += p.vx
        p.y += p.vy
        if (p.x < 0) p.x = w
        if (p.x > w) p.x = 0
        if (p.y < 0) p.y = h
        if (p.y > h) p.y = 0
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(99, 102, 241, ${p.alpha})`
        ctx.fill()
      }
      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 120) {
            ctx.beginPath()
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.strokeStyle = `rgba(99, 102, 241, ${0.08 * (1 - dist / 120)})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }
      animId = requestAnimationFrame(draw)
    }

    draw()
    const onResize = () => {
      w = canvas.width = window.innerWidth
      h = canvas.height = window.innerHeight
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <div style={styles.root}>
      <canvas ref={canvasRef} style={styles.canvas} />
      <div style={styles.content}>
        {/* Logo / Title */}
        <div style={styles.logoWrap}>
          <div style={styles.logoGlow} />
          <h1 style={styles.title}>ASDS</h1>
          <p style={styles.subtitle}>Automated Similarity Detection System</p>
        </div>

        {/* Description */}
        <p style={styles.desc}>
          Detect plagiarism and similarity across academic documents using<br />
          advanced multi-signal AI analysis — TF-IDF, Semantic Embeddings &amp; Cross-Encoder.
        </p>

        {/* CTA or Setup */}
        {setupRequired ? (
          <div style={styles.setupCard}>
            <div style={styles.setupHeader}>
              <h3 style={styles.setupTitle}>First-Time Setup Required</h3>
              <p style={styles.setupDesc}>We need to download the core AI models and PyTorch engine to this computer.</p>
            </div>
            
            {setupRunning ? (
              <div style={styles.progressWrap}>
                <div style={styles.progressLog}>{setupLog}</div>
                <div className="progress-bar-track" style={styles.progressBar}>
                  <div className="progress-bar-fill" style={{ 
                    width: setupLog.match(/(\d+)%/) ? setupLog.match(/(\d+)%/)[1] + '%' : '100%',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>
            ) : (
              <button 
                className="btn btn-primary" 
                style={{ ...styles.startBtn, boxShadow: '0 0 30px rgba(224, 85, 85, 0.4)' }} 
                onClick={handleStartSetup}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Download AI Engine (~1.5 GB)
              </button>
            )}
          </div>
        ) : (
          <button id="start-btn" style={styles.startBtn} onClick={onStart} className="btn btn-primary">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Get Started
          </button>
        )}

        {/* Feature pills */}
        <div style={styles.pills}>
          {['Multi-Signal Analysis', 'PDF & DOCX Support', 'Class-based Sessions', 'Flagged Pair Detection'].map(t => (
            <span key={t} style={styles.pill}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

const styles = {
  root: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    background: 'radial-gradient(ellipse 80% 60% at 50% 20%, rgba(99, 102, 241, 0.1) 0%, transparent 70%), var(--bg-base)',
  },
  canvas: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 28,
    zIndex: 1,
    textAlign: 'center',
    padding: '0 24px',
    animation: 'slideUp 0.7s ease',
  },
  badge: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: 'var(--accent-dim)',
    border: '1px solid var(--border-accent)',
    borderRadius: 20,
    padding: '6px 16px',
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--accent)',
    letterSpacing: '0.5px',
  },
  badgeDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'var(--accent)',
    display: 'inline-block',
    boxShadow: '0 0 8px var(--accent)',
  },
  logoWrap: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  logoGlow: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 300,
    height: 120,
    background: 'radial-gradient(ellipse, rgba(99, 102, 241, 0.2) 0%, transparent 70%)',
    pointerEvents: 'none',
    filter: 'blur(20px)',
  },
  title: {
    fontSize: 88,
    fontWeight: 900,
    letterSpacing: 18,
    color: 'var(--text-primary)',
    lineHeight: 1,
    fontFamily: "'JetBrains Mono', monospace",
    textShadow: '0 0 40px rgba(99, 102, 241, 0.3), 0 0 80px rgba(99, 102, 241, 0.1)',
    position: 'relative',
  },
  subtitle: {
    fontSize: 15,
    fontWeight: 500,
    color: 'var(--text-secondary)',
    letterSpacing: 3,
    textTransform: 'uppercase',
    position: 'relative',
  },
  desc: {
    fontSize: 15,
    color: 'var(--text-muted)',
    lineHeight: 1.8,
    maxWidth: 520,
  },
  startBtn: {
    padding: '14px 44px',
    fontSize: 16,
    borderRadius: 14,
    gap: 10,
    animation: 'pulse-glow 3s ease-in-out infinite',
  },
  pills: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  pill: {
    background: 'rgba(0,0,0,0.03)',
    border: '1px solid var(--border)',
    borderRadius: 20,
    padding: '5px 14px',
    fontSize: 12,
    color: 'var(--text-secondary)',
    fontWeight: 500,
  },
  setupCard: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-accent)',
    borderRadius: 16,
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
    width: '100%',
    maxWidth: 400,
    boxShadow: 'var(--shadow-glow)',
  },
  setupHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  setupTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  setupDesc: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
  },
  progressWrap: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  progressLog: {
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--text-secondary)',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  progressBar: {
    height: 8,
    background: 'var(--bg-input)',
    borderRadius: 4,
    border: '1px solid var(--border)',
  },
}
