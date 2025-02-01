import { useState } from "react"
import { ArrowLeft, Play, CheckCircle2, Circle, XCircle, ChevronRight, ChevronDown, ChevronUp, Copy } from "lucide-react"
import { Button } from "../components/ui/button"
// import { ScrollArea } from "../components/ui/scroll-area"
import { Card, CardContent } from "../components/ui/card"
import { executeWorkflow, WorkflowStep, StepStatus } from "../helpers/executors"
import { toast } from "../components/ui/use-toast"

interface WorkflowViewProps {
  workflow: {
    name: string;
    steps: WorkflowStep[];
  };
  onBack: () => void;
}

export function WorkflowView({ workflow, onBack }: WorkflowViewProps) {
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionProgress, setExecutionProgress] = useState('')
  const [nodes, setNodes] = useState(workflow.steps)
  const [userInput, setUserInput] = useState('')
  const [showSteps, setShowSteps] = useState(true)
  const [finalOutput, setFinalOutput] = useState<string | null>(null)
  // const [elapsedTime, setElapsedTime] = useState(0)

  // Check if first node is an input type
  const firstNode = nodes[0]
  const requiresInput = firstNode?.nodeType?.toLowerCase().includes('input')

  // Format elapsed time as mm:ss
  // const formatTime = (seconds: number) => {
  //   const mins = Math.floor(seconds / 60)
  //   const secs = seconds % 60
  //   return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  // }

  const handleExecuteWorkflow = async () => {
    if (requiresInput && !userInput.trim()) {
      toast({
        variant: "destructive",
        title: "Input required",
        description: "Please provide input before running the workflow"
      })
      return
    }

    setIsExecuting(true)
    setFinalOutput(null)
    // setElapsedTime(0)
    
    // Start timer
    // const startTime = Date.now()
    // const timer = setInterval(() => {
    //   setElapsedTime(Math.floor((Date.now() - startTime) / 1000))
    // }, 1000)
    
    try {
      // Create a new nodes array with the updated input
      const updatedNodes = nodes.map((node, index) => {
        if (index === 0 && requiresInput) {
          return {
            ...node,
            data: {
              ...node.data,
              value: userInput
            }
          }
        }
        return node
      })

      // Update nodes state first
      setNodes(updatedNodes)

      // Wait a moment for state to update
      await new Promise(resolve => setTimeout(resolve, 0))

      const result = await executeWorkflow({
        nodes: updatedNodes,
        setNodes,
        onProgress: (message) => {
          setExecutionProgress(message)
        }
      })

      if (result.success && result.finalOutput) {
        setFinalOutput(result.finalOutput)
      } else {
        toast({
          variant: "destructive",
          title: "Workflow execution failed"
        })
      }
    } catch (error) {
      console.error('Error executing workflow:', error)
      toast({
        variant: "destructive",
        title: "Error executing workflow"
      })
    } finally {
      // clearInterval(timer)
      setIsExecuting(false)
      setExecutionProgress('')
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast({
        title: "Copied to clipboard",
        duration: 2000
      })
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to copy"
      })
    }
  }

  const getStepIcon = (status: StepStatus) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />
      case 'running':
        return <Circle className="w-5 h-5 text-blue-500 animate-pulse" />
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />
      default:
        return <Circle className="w-5 h-5 text-gray-300" />
    }
  }

  return (
    <div className="flex flex-col bg-background">
      <div className="flex items-center justify-between p-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <div className="flex items-center">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="ml-2 text-lg font-semibold text-foreground">{workflow.name}</h2>
        </div>
        <div className="flex items-center gap-4">
          {/* {isExecuting && (
            <span className="text-sm text-muted-foreground">
              Time: {formatTime(elapsedTime)}
            </span>
          )} */}
          <Button 
            onClick={handleExecuteWorkflow}
            disabled={isExecuting || (requiresInput && !userInput.trim())}
            className="flex items-center gap-2"
          >
            <Play className="h-4 w-4" />
            {isExecuting ? 'Executing...' : 'Execute'}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Input section */}
        {requiresInput && (
          <div className="p-4 border-b bg-background">
            <div className="mb-2 text-sm font-medium text-foreground">
              {firstNode.name}
            </div>
            <textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder={`Enter ${firstNode.nodeType === 'linkedinInput' ? 'LinkedIn profile HTML' : 'input'} here...`}
              className="w-full h-32 p-3 rounded-md bg-background border text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-input resize-none"
              disabled={isExecuting}
            />
          </div>
        )}

        {executionProgress && (
          <div className="p-2 bg-primary/10 text-primary text-sm sticky top-0 z-10">
            {executionProgress}
          </div>
        )}

        {/* Final Output Display */}
        {finalOutput && (
          <div className="p-4 border-b bg-background">
            <div className="flex justify-between mb-2">
              <h3 className="font-semibold text-foreground">Final Output</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(finalOutput)}
                className="flex items-center gap-1"
              >
                <Copy className="h-4 w-4" />
                Copy
              </Button>
            </div>
            <Card>
              <CardContent className="p-4 max-h-[300px] overflow-y-auto bg-muted/50">
                <pre className="whitespace-pre-wrap break-words text-sm text-foreground text-left">
                  {finalOutput}
                </pre>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Collapsible Workflow Steps */}
        <div className="border-b bg-background sticky top-0 z-10">
          <Button
            variant="ghost"
            className="w-full flex justify-between"
            onClick={() => setShowSteps(!showSteps)}
          >
            <span className="font-medium text-foreground">Workflow Steps</span>
            {showSteps ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>

        {showSteps && (
          <div className="p-4 bg-muted/50">
            <Card>
              <CardContent className="p-4 space-y-3">
                {nodes.map((node) => (
                  <div key={node.id} className="p-3 border rounded-lg bg-background hover:bg-muted/50 transition-colors">
                    <div className="flex items-start gap-3">
                      {getStepIcon(node.status)}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-foreground">{node.name}</div>
                        <div className="text-sm text-muted-foreground">Type: {node.nodeType || 'default'}</div>
                        {node.logs.length > 0 && (
                          <div className="mt-2 bg-muted rounded-md p-3">
                            {node.logs.map((log, idx) => (
                              <div key={idx} className="text-sm text-muted-foreground flex items-start gap-1">
                                <ChevronRight className="w-3 h-3 mt-1 flex-shrink-0" />
                                <span className="flex-1">{log}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

