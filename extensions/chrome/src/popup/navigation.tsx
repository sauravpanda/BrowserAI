import { MessageSquare, Workflow, ArrowUpCircle } from "lucide-react"
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
    <nav className="border-t flex items-center justify-around p-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <button 
        className="flex flex-col items-center p-2 text-sm text-muted-foreground hover:text-primary w-24"
        onClick={() => window.location.hash = '#workflow-view'}
      >
        <Workflow className="h-5 w-5 mb-1" />
        <span>Workflow</span>
      </button>
      <button 
        className="flex flex-col items-center p-2 text-sm text-muted-foreground hover:text-primary w-24"
        onClick={() => window.location.hash = '#chat-view'}
      >
        <MessageSquare className="h-5 w-5 mb-1" />
        <span>Chat</span>
      </button>
      <button 
        className="flex flex-col items-center p-2 text-sm text-muted-foreground hover:text-primary w-24"
        onClick={() => window.open('https://browseragent.dev/upgrade', '_blank')}
      >
        <ArrowUpCircle className="h-5 w-5 mb-1" />
        <span>Upgrade</span>
      </button>
    </nav>
  )
}

