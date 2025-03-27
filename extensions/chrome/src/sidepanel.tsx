import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import './App.css'
import './index.css'
import { Button } from './components/ui/button'
import { HTMLCleanerTest } from './components/HTMLCleanerTest'

function SidePanel() {
  const [currentView, setCurrentView] = useState<'main' | 'htmlCleaner'>('main')

  return (
    <div className="flex flex-col h-screen">
      <header className="border-b p-4">
        <h1 className="text-lg font-bold">Browser AI</h1>
      </header>
      
      <nav className="border-b p-2 flex gap-2">
        <Button 
          variant={currentView === 'main' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => setCurrentView('main')}
        >
          Main
        </Button>
        <Button 
          variant={currentView === 'htmlCleaner' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => setCurrentView('htmlCleaner')}
        >
          HTML Cleaner
        </Button>
      </nav>
      
      <main className="flex-1 overflow-auto">
        {currentView === 'main' && (
          <div className="p-4">
            <h2 className="text-lg font-semibold mb-4">Browser AI</h2>
            <p>Use this panel to interact with your AI assistant.</p>
          </div>
        )}
        
        {currentView === 'htmlCleaner' && <HTMLCleanerTest />}
      </main>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('side-panel-root')!).render(
  <React.StrictMode>
    <SidePanel />
  </React.StrictMode>,
) 