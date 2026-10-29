import { useState, useEffect } from 'react'
import LandingPage from './pages/LandingPage'
import ClassesPage from './pages/ClassesPage'
import AnalysisPage from './pages/AnalysisPage'
import TitleBar from './components/TitleBar'

const appAnalysisCache = new Map()

export default function App() {
  const [page, setPage] = useState('landing') // 'landing' | 'classes' | 'analysis'
  const [activeClass, setActiveClass] = useState(null)
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light')

  const goToClasses = () => setPage('classes')
  const goToAnalysis = (cls) => {
    setActiveClass(cls)
    setPage('analysis')
  }
  const goBack = () => setPage('classes')

  return (
    <div className="app-shell">
      <TitleBar onBack={page === 'analysis' ? goBack : null} currentPage={page} />
      {page === 'landing' && <LandingPage onStart={goToClasses} />}
      {page === 'classes' && <ClassesPage onOpenClass={goToAnalysis} theme={theme} onToggleTheme={toggleTheme} />}
      {page === 'analysis' && <AnalysisPage classData={activeClass} onBack={goBack} stateCache={appAnalysisCache} />}
    </div>
  )
}
