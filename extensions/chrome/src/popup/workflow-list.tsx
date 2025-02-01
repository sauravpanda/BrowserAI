import { Loader2, View, RefreshCw } from "lucide-react"
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
      <div className="flex justify-end mb-4">
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
        <Card key={workflow.id} className="hover:bg-muted/50 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium text-foreground">{workflow.name}</h2>
                <p className="text-sm text-muted-foreground">{workflow.description}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleWorkflowClick(workflow)}>
                <View className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

