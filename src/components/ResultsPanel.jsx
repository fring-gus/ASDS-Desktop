import { useState, useMemo } from 'react'

/* ── Union-Find (Disjoint Set Union) for transitive grouping ── */
function buildGroups(flaggedPairs, allPairs, getScoreFn, threshold) {
  const parent = {}
  const find = (x) => {
    if (!(x in parent)) parent[x] = x
    if (parent[x] !== x) parent[x] = find(parent[x])
    return parent[x]
  }
  const union = (a, b) => {
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }

  // Union all flagged pairs
  for (const p of flaggedPairs) {
    union(p.file_a, p.file_b)
  }

  // Collect members per group
  const groupMap = {}
  for (const p of flaggedPairs) {
    for (const f of [p.file_a, p.file_b]) {
      const root = find(f)
      if (!groupMap[root]) groupMap[root] = new Set()
      groupMap[root].add(f)
    }
  }

  // Build group objects
  const groups = Object.values(groupMap).map(memberSet => {
    const members = [...memberSet].sort()
    // Find only pairs within the threshold between group members
    const memberLookup = new Set(members)
    const pairs = allPairs.filter(
      r => memberLookup.has(r.file_a) && memberLookup.has(r.file_b) && getScoreFn(r) >= threshold
    ).sort((a, b) => getScoreFn(b) - getScoreFn(a))
    const maxScore = Math.max(...pairs.map(getScoreFn))
    return { members, pairs, maxScore }
  })

  // Sort groups by maxScore descending
  groups.sort((a, b) => b.maxScore - a.maxScore)
  return groups
}

export default function ResultsPanel({ results, filenames, mode, semanticThreshold = 0.65, lexicalThreshold = 0.65 }) {
  const [allPairsOpen, setAllPairsOpen] = useState(true)
  const [flaggedOpen, setFlaggedOpen] = useState(true)

  const threshold = mode === 'semantic' ? semanticThreshold : lexicalThreshold

  const flagged = results.filter(r => r.is_flagged)
  const all = results

  const scoreColor = (score) => {
    if (score >= threshold) return 'var(--danger)'
    if (score >= threshold * 0.85) return 'var(--warning)'
    return 'var(--success)'
  }

  const scoreBgClass = (score) => {
    if (score >= threshold) return 'badge-danger'
    if (score >= threshold * 0.85) return 'badge-warning'
    return 'badge-success'
  }

  const pct = (v) => `${(v * 100).toFixed(1)}%`
  const getScore = (r) => r.mode === 'semantic' ? r.semantic_score : r.tfidf_score

  const groups = useMemo(
    () => buildGroups(flagged, all, getScore, threshold),
    [results, threshold]
  )

  return (
    <div style={s.root}>
      {/* Summary bar */}
      <div style={s.summaryBar}>
        <div style={s.summaryItem}>
          <span style={s.summaryVal}>{results.length}</span>
          <span style={s.summaryLabel}>Total Pairs</span>
        </div>
        <div style={s.summaryDiv} />
        <div style={s.summaryItem}>
          <span style={{ ...s.summaryVal, color: groups.length > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {groups.length}
          </span>
          <span style={s.summaryLabel}>Flagged Groups</span>
        </div>
        <div style={s.summaryDiv} />
        <div style={s.summaryItem}>
          <span style={{ ...s.summaryVal, color: flagged.length > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {flagged.length}
          </span>
          <span style={s.summaryLabel}>Flagged Pairs</span>
        </div>
        <div style={s.summaryDiv} />
        <div style={s.summaryItem}>
          <span style={s.summaryVal}>{filenames.length}</span>
          <span style={s.summaryLabel}>Documents</span>
        </div>
        <div style={s.summaryDiv} />
        <div style={s.summaryItem}>
          <span style={{ ...s.summaryVal, fontFamily: "'JetBrains Mono', monospace", fontSize: 16 }}>
            {results.length > 0 ? pct(Math.max(...results.map(getScore))) : '—'}
          </span>
          <span style={s.summaryLabel}>Highest Similarity Score</span>
        </div>
        <div style={s.summaryDiv} />
        <div style={s.summaryItem}>
          <span style={{ ...s.summaryVal, fontFamily: "'JetBrains Mono', monospace", fontSize: 16, color: 'var(--accent-light)' }}>
            {pct(threshold)}
          </span>
          <span style={s.summaryLabel}>{mode === 'semantic' ? 'Semantic' : 'Lexical'} Threshold</span>
        </div>
      </div>

      <div style={s.body}>
        {/* ── Flagged Groups Section ── */}
        <Section
          id="flagged-section"
          icon="🚩"
          iconBg="var(--danger-dim)"
          title="Flagged Groups"
          count={groups.length}
          countColor="var(--danger)"
          open={flaggedOpen}
          onToggle={() => setFlaggedOpen(o => !o)}
        >
          {groups.length === 0 ? (
            <div style={s.emptySection}>
              <span style={{ fontSize: 24 }}>✅</span>
              <span>No pairs were flagged above the similarity threshold.</span>
            </div>
          ) : (
            <div style={s.flaggedGrid}>
              {groups.map((group, i) => (
                <FlaggedGroupCard
                  key={i}
                  group={group}
                  groupIndex={i + 1}
                  pct={pct}
                  getScore={getScore}
                  threshold={threshold}
                  scoreColor={scoreColor}
                />
              ))}
            </div>
          )}
        </Section>

        {/* ── All Pairs Section ── */}
        <Section
          id="all-pairs-section"
          icon="📋"
          iconBg="var(--accent-dim)"
          title="All Pairs"
          count={all.length}
          countColor="var(--accent-light)"
          open={allPairsOpen}
          onToggle={() => setAllPairsOpen(o => !o)}
        >
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>#</th>
                  <th style={s.th}>Document A</th>
                  <th style={s.th}>Document B</th>
                  <th style={{ ...s.th, textAlign: 'center' }}>Similarity Score</th>
                  <th style={{ ...s.th, textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {all.map((r, i) => (
                  <tr key={i} style={{ ...s.tr, ...(i % 2 === 0 ? s.trEven : {}) }}>
                    <td style={{ ...s.td, ...s.tdMono, color: 'var(--text-muted)' }}>{i + 1}</td>
                    <td style={s.td}>
                      <div style={s.docName} title={r.file_a}>
                        <span style={s.docExt}>{r.file_a?.split('.').pop()?.toUpperCase()}</span>
                        {r.file_a?.replace(/\.[^.]+$/, '')}
                      </div>
                    </td>
                    <td style={s.td}>
                      <div style={s.docName} title={r.file_b}>
                        <span style={s.docExt}>{r.file_b?.split('.').pop()?.toUpperCase()}</span>
                        {r.file_b?.replace(/\.[^.]+$/, '')}
                      </div>
                    </td>
                    <td style={{ ...s.td, textAlign: 'center' }}>
                      <div style={s.scoreCell}>
                        <span style={{ ...s.scoreVal, color: scoreColor(getScore(r)) }}>
                          {pct(getScore(r))}
                        </span>
                        <div style={s.miniBar}>
                          <div style={{
                            ...s.miniBarFill,
                            width: pct(getScore(r)),
                            background: scoreColor(getScore(r)),
                          }} />
                        </div>
                      </div>
                    </td>
                    <td style={{ ...s.td, textAlign: 'center' }}>
                      <span className={`badge ${scoreBgClass(getScore(r))}`}>
                        {r.is_flagged ? '⚑ Flagged' : '✓ OK'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  )
}

function Section({ id, icon, iconBg, title, count, countColor, open, onToggle, children }) {
  return (
    <div style={sectionS.root} id={id} className="fade-in">
      <button style={sectionS.header} onClick={onToggle}>
        <div style={{ ...sectionS.icon, background: iconBg }}>{icon}</div>
        <span style={sectionS.title}>{title}</span>
        <span style={{ ...sectionS.count, color: countColor, borderColor: countColor + '44', background: countColor + '15' }}>
          {count}
        </span>
        <svg
          style={{ ...sectionS.chevron, transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && <div style={sectionS.body}>{children}</div>}
    </div>
  )
}

function FlaggedGroupCard({ group, groupIndex, pct, getScore, threshold, scoreColor }) {
  const maxColor = group.maxScore >= 0.8 ? 'var(--danger)' : group.maxScore >= 0.65 ? '#e07722' : 'var(--warning)'

  return (
    <div style={gc.card} className="slide-up">
      {/* ── Group Header ── */}
      <div style={gc.header}>
        <div style={gc.headerLeft}>
          <span style={{ ...gc.badge, background: maxColor + '18', color: maxColor, borderColor: maxColor + '44' }}>
            ⚑ GROUP {groupIndex}
          </span>
          <span style={gc.memberCount}>
            {group.members.length} related document{group.members.length > 1 ? 's' : ''}
          </span>
        </div>
        <div style={gc.maxScoreWrap}>
          <span style={gc.maxLabel}>MAX</span>
          <span style={{ ...gc.maxScore, color: maxColor }}>{pct(group.maxScore)}</span>
        </div>
      </div>

      {/* ── Members List ── */}
      <div style={gc.members}>
        {group.members.map((name, i) => (
          <div key={name} style={gc.memberRow}>
            <div style={{
              ...gc.memberIcon,
              background: i === 0 ? 'var(--accent-dim)' : maxColor + '20',
              color: i === 0 ? 'var(--accent-light)' : maxColor,
            }}>
              {String.fromCharCode(65 + i)}
            </div>
            <div style={gc.memberName} title={name}>
              <span style={gc.memberExt}>{name.split('.').pop()?.toUpperCase()}</span>
              {name.replace(/\.[^.]+$/, '')}
            </div>
          </div>
        ))}
      </div>

      {/* ── Pairwise Scores Table ── */}
      <div style={gc.pairSection}>
        <div style={gc.pairTitle}>Pairwise Scores</div>
        <div style={gc.pairList}>
          {group.pairs.map((r, i) => {
            const score = getScore(r)
            const color = scoreColor(score)
            return (
              <div key={i} style={gc.pairRow}>
                <div style={gc.pairNames}>
                  <span style={gc.pairFile}>{r.file_a?.replace(/\.[^.]+$/, '')}</span>
                  <span style={gc.pairArrow}>↔</span>
                  <span style={gc.pairFile}>{r.file_b?.replace(/\.[^.]+$/, '')}</span>
                </div>
                <div style={gc.pairScoreArea}>
                  <div style={gc.pairMiniBar}>
                    <div style={{
                      ...gc.pairMiniBarFill,
                      width: pct(score),
                      background: color,
                    }} />
                  </div>
                  <span style={{ ...gc.pairScoreVal, color }}>{pct(score)}</span>
                  <span style={{
                    ...gc.pairStatus,
                    color: r.is_flagged ? 'var(--danger)' : 'var(--success)',
                  }}>
                    {r.is_flagged ? '⚑' : '✓'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const s = {
  root: {
    height: '100%',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  summaryBar: {
    display: 'flex',
    alignItems: 'center',
    padding: '14px 28px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)',
    gap: 0,
    flexShrink: 0,
  },
  summaryItem: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  summaryVal: {
    fontSize: 20,
    fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace",
    color: 'var(--text-primary)',
  },
  summaryLabel: {
    fontSize: 10,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  summaryDiv: {
    width: 1,
    height: 32,
    background: 'var(--border)',
    margin: '0 16px',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 28px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    minHeight: 0,
  },
  emptySection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: '24px',
    color: 'var(--text-muted)',
    fontSize: 13,
  },
  flaggedGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: 14,
  },
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    textAlign: 'left',
    padding: '10px 14px',
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)',
    whiteSpace: 'nowrap',
  },
  tr: {
    borderBottom: '1px solid var(--border)',
    transition: 'background 0.15s',
  },
  trEven: {
    background: 'var(--bg-hover)',
  },
  td: {
    padding: '11px 14px',
    color: 'var(--text-secondary)',
    verticalAlign: 'middle',
  },
  tdMono: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
  },
  docName: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    maxWidth: 200,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  docExt: {
    fontSize: 9,
    fontWeight: 700,
    padding: '2px 5px',
    borderRadius: 3,
    background: 'rgba(124,92,252,0.15)',
    color: 'var(--accent-light)',
    fontFamily: "'JetBrains Mono', monospace",
    flexShrink: 0,
  },
  scoreCell: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  scoreVal: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
    fontWeight: 600,
  },
  miniBar: {
    width: 60,
    height: 4,
    background: 'var(--border)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  miniBarFill: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.4s ease',
  },
}

// Group card styles
const gc = {
  card: {
    background: 'var(--bg-card)',
    border: '1px solid rgba(224,85,85,0.4)',
    boxShadow: 'var(--shadow-card)',
    borderRadius: 14,
    padding: 18,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  badge: {
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.5px',
    border: '1px solid',
    alignSelf: 'flex-start',
  },
  memberCount: {
    fontSize: 11,
    color: 'var(--text-muted)',
    paddingLeft: 2,
  },
  maxScoreWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 0,
  },
  maxLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: 'var(--text-muted)',
    letterSpacing: '0.5px',
  },
  maxScore: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 22,
    fontWeight: 700,
    lineHeight: 1,
  },
  members: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  memberRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '7px 12px',
  },
  memberIcon: {
    width: 26,
    height: 26,
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 11,
    flexShrink: 0,
    fontFamily: "'JetBrains Mono', monospace",
  },
  memberName: {
    fontSize: 12,
    color: 'var(--text-primary)',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: "'JetBrains Mono', monospace",
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  memberExt: {
    fontSize: 9,
    fontWeight: 700,
    padding: '2px 5px',
    borderRadius: 3,
    background: 'rgba(124,92,252,0.15)',
    color: 'var(--accent-light)',
    fontFamily: "'JetBrains Mono', monospace",
    flexShrink: 0,
  },
  pairSection: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  pairTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    padding: '8px 12px 6px',
  },
  pairList: {
    display: 'flex',
    flexDirection: 'column',
  },
  pairRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 12px',
    borderTop: '1px solid var(--border)',
    gap: 8,
  },
  pairNames: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    minWidth: 0,
    flex: 1,
  },
  pairFile: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 100,
  },
  pairArrow: {
    color: 'var(--text-muted)',
    flexShrink: 0,
    fontSize: 10,
  },
  pairScoreArea: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  pairMiniBar: {
    width: 40,
    height: 4,
    background: 'var(--border)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  pairMiniBarFill: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.4s ease',
  },
  pairScoreVal: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    fontWeight: 600,
    minWidth: 38,
    textAlign: 'right',
  },
  pairStatus: {
    fontSize: 11,
    fontWeight: 600,
    width: 14,
    textAlign: 'center',
  },
}

// Section component styles
const sectionS = {
  root: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-card)',
    borderRadius: 14,
    overflow: 'hidden',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 18px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    borderBottom: '1px solid transparent',
    transition: 'background 0.15s',
    color: 'inherit',
    fontFamily: 'inherit',
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 15,
    flexShrink: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text-primary)',
    flex: 1,
    textAlign: 'left',
  },
  count: {
    padding: '2px 10px',
    borderRadius: 10,
    fontSize: 12,
    fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace",
    border: '1px solid',
  },
  chevron: {
    color: 'var(--text-muted)',
    transition: 'transform 0.25s ease',
    flexShrink: 0,
  },
  body: {
    padding: '16px 18px',
    borderTop: '1px solid var(--border)',
  },
}
