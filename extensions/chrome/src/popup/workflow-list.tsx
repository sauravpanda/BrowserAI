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
    console.log('Frontend: Initial load of workflows');
    chrome.runtime.sendMessage({ action: 'getWorkflows' }, (response) => {
      console.log('Frontend: Got workflows response:', response);
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
    console.log('Frontend: Clicking workflow:', workflow);
    chrome.runtime.sendMessage(
      { action: 'getWorkflowData', workflowId: workflow.id }, 
      (response) => {
        console.log('Frontend: Got response:', response);
        if (response && response.workflowData) {
          setSelectedWorkflowData(response.workflowData)
          setSelectedWorkflow(workflow)
          console.log('Frontend: Set workflow data and selected workflow');
        } else {
          console.error('Frontend: No workflow data in response');
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
      <div className="flex justify-between items-center mb-10">
        <h2 className="text-lg font-semibold">All workflows</h2>
        <Button 
          variant="default"
          size="sm" 
          onClick={handleSyncWorkflows}
          className="flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Sync Workflows
        </Button>
      </div>
      {workflowList.map((workflow) => (
        <Card 
          key={workflow.id} 
          className="workflow-container relative hover:bg-accent/50 active:bg-accent/70 transition-colors cursor-pointer"
          onClick={() => handleWorkflowClick(workflow)}
        >
          <CardContent className="p-2">
            <div className="flex flex-col items-start w-full">
              <h2 className="workflow-title">{workflow.name}</h2>
              <p className="text-sm text-muted-foreground">{workflow.description}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

