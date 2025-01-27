import { useState } from 'react'
import BrowserView from './components/BrowserView'
import AgentChat from './components/AgentChat'
import './App.css'

function App() {
  const [currentUrl, setCurrentUrl] = useState('https://example.com')

  return (
    <div className="h-screen flex bg-gray-100 w-full">
      <AgentChat currentUrl={currentUrl} onNavigate={setCurrentUrl} />
      <BrowserView url={currentUrl} onUrlChange={setCurrentUrl} />
    </div>
  )
}

export default App
