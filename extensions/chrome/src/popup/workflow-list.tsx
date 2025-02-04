import { Loader2, RefreshCw } from "lucide-react"
import { Button } from "../components/ui/button"
import { Card, CardContent } from "../components/ui/card"
import { useState, useEffect } from "react"
import { WorkflowView } from "./workflow-view"

interface Workflow {
  id: string
  name: string
  description: string
  type: string
}

interface WorkflowListProps {
  workflows: Workflow[]
  isLoading: boolean
}

export function WorkflowList({ workflows, isLoading }: WorkflowListProps) {
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null)
  const [selectedWorkflowData, setSelectedWorkflowData] = useState<any>(null)
  const [workflowList, setWorkflowList] = useState(workflows)

  useEffect(() => {
    // Initial load of workflows
    chrome.runtime.sendMessage({ action: 'getWorkflows' }, (response) => {
      if (response && response.workflows) {
        setWorkflowList(response.workflows)
      }
    })

    // Listen for workflow updates
    const handleMessage = (message: any) => {
      if (message.action === 'workflowsUpdated') {
        setWorkflowList(message.workflows)
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [])

  const handleWorkflowClick = (workflow: Workflow) => {
    chrome.runtime.sendMessage(
      { action: 'getWorkflowData', workflowId: workflow.id }, 
      (response) => {
        if (response && response.workflowData) {
          setSelectedWorkflowData(response.workflowData)
          setSelectedWorkflow(workflow)
        }
      }
    )
  }

  const handleSyncWorkflows = () => {
    chrome.runtime.sendMessage({ action: "refreshWorkflows" })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (selectedWorkflow && selectedWorkflowData) {
    return (
      <WorkflowView 
        workflow={selectedWorkflowData} 
        onBack={() => {
          setSelectedWorkflow(null)
          setSelectedWorkflowData(null)
        }} 
      />
    )
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">Workflows</h2>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleSyncWorkflows}
          className="flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Sync Workflows
        </Button>
      </div>
      {workflowList.map((workflow) => (
        <Card key={workflow.id} className="workflow-container">
          <CardContent className="p-4">
            <div className="flex justify-between items-start w-full">
              <div className="flex flex-col items-start">
                <h2 className="workflow-title">{workflow.name}</h2>
                <p className="text-sm text-muted-foreground">{workflow.description}</p>
              </div>
              <div className="flex items-center ml-4">
                <Button variant="ghost" className="button-text" onClick={() => handleWorkflowClick(workflow)}>
                  Details
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

