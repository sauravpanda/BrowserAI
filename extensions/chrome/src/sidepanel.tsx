import React from 'react'
import ReactDOM from 'react-dom/client'
import './App.css'
import './index.css'
import App from './App'

function SidePanel() {
  return (
    <div className="sidepanel-container" style={{
      width: '100%',
      height: '100vh',
      padding: '16px',
      backgroundColor: '#ffffff',
      color: '#213547'
    }}>
      <h2>Browser AI Side Panel</h2>
      <App />
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('side-panel-root')!).render(
  <React.StrictMode>
    <SidePanel />
  </React.StrictMode>,
) 