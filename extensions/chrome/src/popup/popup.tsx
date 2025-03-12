"use client"

import { useState, useEffect } from "react"
import { WorkflowList } from "./workflow-list"
{/*import { Header } from "./header"*/}
import { Navigation } from "./navigation"
import { createRoot } from 'react-dom/client'
import { ChatInterface } from "./chat-interface"
import { WorkflowRunner } from "../sidepanel/workflow-runner"
import { ContentIdentifierTest } from "../sidepanel/content-identifier-test"
import { HTMLCleanerTest } from "../components/HTMLCleanerTest"

interface Workflow {
  id: string
  name: string
  description: string
  type: string
}

export default function Popup() {
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [isLoading, _] = useState(false)
  const [currentView, setCurrentView] = useState(window.location.hash.slice(1) || 'workflow-view')

  useEffect(() => {
    // Listen for hash changes
    const handleHashChange = () => {
      setCurrentView(window.location.hash.slice(1) || 'workflow-view')
    }

    window.addEventListener('hashchange', handleHashChange)
    handleHashChange() // Initial check
    // Fetch workflows (replace with actual API call in production)
    setWorkflows([
      {
        id: "1",
        name: "LinkedIn Profile Scraper",
        description: "Extract data from LinkedIn profiles",
        type: "scraper",
      },
      { id: "2", name: "Email Finder", description: "Find email addresses for contacts", type: "finder" },
      { id: "3", name: "Lead Qualifier", description: "Qualify leads based on criteria", type: "qualifier" },
    ])

    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const renderView = () => {
    switch (currentView) {
      case 'chat-view':
        return <ChatInterface />
      case 'runner-view':
        return <WorkflowRunner />
      case 'content-identifier-test':
        return <ContentIdentifierTest />
      case 'html-cleaner-test':
        return <HTMLCleanerTest />
      case 'workflow-view':
      default:
        return (
          <>
            <WorkflowList workflows={workflows} isLoading={isLoading} />
          </>
        )
    }
  }

  return (
    <div className="w-[350px] h-screen bg-background text-foreground flex flex-col">
      {/* <Header /> */}
      <main className="flex-1 overflow-y-auto bg-background">
        {renderView()}
      </main>
      <Navigation />
    </div>
  )
}

const container = document.getElementById('root')
if (container) {
  const root = createRoot(container)
  root.render(<Popup />)
}

