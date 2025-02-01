import { Suspense, lazy } from 'react'
import './App.css'
import './index.css'

const Popup = lazy(() => import('./popup/popup'))

function App() {
  return (
    <div className="min-w-[400px]">
      <Suspense fallback={<div>Loading...</div>}>
        <Popup />
      </Suspense>
    </div>
  )
}

export default App
