// import { MessageSquare, Workflow, ArrowUpCircle, Play } from "lucide-react"
import { MessageSquare, Workflow, ArrowUpCircle, Play, Code } from "lucide-react"
import { useState, useEffect } from 'react'

export function Navigation() {
  const [currentView, setCurrentView] = useState(window.location.hash.slice(1) || 'workflow-view')

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentView(window.location.hash.slice(1) || 'workflow-view')
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])
  console.debug(currentView)
  return (
    <nav className="flex items-center justify-around p-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <button 
        className={`nav-button flex flex-col items-center w-24 ${currentView === 'workflow-view' ? 'active' : ''}`}
        onClick={() => window.location.hash = '#workflow-view'}
      >
        <Workflow className="h-5 w-5 mb-1" />
        <span>Workflows</span>
      </button>
      <button 
        className={`nav-button flex flex-col items-center w-24 ${currentView === 'chat-view' ? 'active' : ''}`}
        onClick={() => window.location.hash = '#chat-view'}
      >
        <MessageSquare className="h-5 w-5 mb-1" />
        <span>Chat</span>
      </button>
      <button 
        className={`nav-button flex flex-col items-center w-24 ${currentView === 'runner-view' ? 'active' : ''}`}
        onClick={() => window.location.hash = '#runner-view'}
      >
        <Play className="h-5 w-5 mb-1" />
        <span>Runner</span>
      </button>
      <button 
        className={`nav-button flex flex-col items-center w-24 ${currentView === 'content-identifier-test' ? 'active' : ''}`}
        onClick={() => window.location.hash = '#content-identifier-test'}
      >
        <Code className="h-5 w-5 mb-1" />
        <span>Content Identifier Test</span>
      </button>
      <button 
        className={`nav-button flex flex-col items-center w-24 ${currentView === 'html-cleaner-test' ? 'active' : ''}`}
        onClick={() => window.location.hash = '#html-cleaner-test'}
      >
        <Code className="h-5 w-5 mb-1" />
        <span>HTML Test</span>
      </button>
      
      <button 
        className={`nav-button flex flex-col items-center w-24`}
        onClick={() => window.open('https://browseragent.dev/pricing/', '_blank')}
      >
        <ArrowUpCircle className="h-5 w-5 mb-1" />
        <span>Upgrade</span>
      </button>
    </nav>
  )
}

