import { useState } from "react"
import { Play, CheckCircle2, Circle, XCircle, ChevronRight, ChevronLeft, Copy } from "lucide-react"
import { Button } from "../components/ui/button"
// import { ScrollArea } from "../components/ui/scroll-area"
import { Card, CardContent } from "../components/ui/card"
import { executeWorkflow, WorkflowStep, StepStatus } from "../helpers/executors"
import { toast } from "../components/ui/use-toast"
import { cn } from "../lib/utils"

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
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [finalOutput, setFinalOutput] = useState<string | null>(null)
  // const [elapsedTime, setElapsedTime] = useState(0)

  // Check if first node is an input type
  // const firstNode = nodes[0]
  // const requiresInput = firstNode?.nodeType?.toLowerCase().includes('input')

  // Check if all required inputs have values
  const areAllInputsFilled = () => {
    return nodes
      .filter(node => node.nodeType?.toLowerCase().includes('input'))
      .every(node => inputs[node.id]?.trim().length > 0);
  };

  // Format elapsed time as mm:ss
  // const formatTime = (seconds: number) => {
  //   const mins = Math.floor(seconds / 60)
  //   const secs = seconds % 60
  //   return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  // }

  const handleExecuteWorkflow = async () => {
    if (!areAllInputsFilled()) {
      toast({
        variant: "destructive",
        title: "Input required",
        description: "Please provide all required inputs before running the workflow"
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
      // Update nodes with their respective inputs
      const updatedNodes = nodes.map(node => {
        if (node.nodeType?.toLowerCase().includes('input')) {
          return {
            ...node,
            data: {
              ...node.data,
              value: inputs[node.id]
            }
          }
        }
        return node
      })

      setNodes(updatedNodes)
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

  const getNodeBackgroundColor = (nodeType: string | undefined) => {
    switch (nodeType?.toLowerCase()) {
      case 'systemprompt':
        return 'bg-gradient-to-r from-[#F5D769] to-[#F2C36C] dark:from-[#5F4D1D] dark:to-[#61431D]';
      case 'chatagent':
        return 'bg-gradient-to-r from-[#739AF3] to-[#7A90F1] dark:from-[#39456E] dark:to-[#202761]';
      case 'textoutput':
        return 'bg-gradient-to-r from-[#D69ADE] to-[#C69EF7] dark:from-[#4F2956] dark:to-[#442966]';
      case 'textinput':
        return 'bg-gradient-to-r from-[#95E2A1] to-[#90DEB4] dark:from-[#3E6C43] dark:to-[#2B503D]';
      case 'readcurrentpage':
        return 'bg-gradient-to-r from-[#9DE8F2] to-[#7ABCDF] dark:from-[#2F555A] dark:to-[#213551]';
      default:
      return 'bg-gray-500/10 dark:bg-gray-500/20';
    }
  };

  return (
    <div className="flex flex-col bg-background">
      <div className="flex items-center justify-between p-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <div className="flex items-center w-full">
          <div 
            onClick={onBack}
            className="cursor-pointer hover:bg-muted/50 rounded-md transition-colors"
          >
            <ChevronLeft className="h-6 w-6" />
          </div>
          <h2 className="ml-2 text-base font-semibold text-foreground text-left w-full leading-none">
            {workflow.name}
          </h2>
        </div>
        <div className="flex items-center gap-8">
          {/* {isExecuting && (
            <span className="text-sm text-muted-foreground">
              Time: {formatTime(elapsedTime)}
            </span>
          )} */}
          <Button 
            onClick={handleExecuteWorkflow}
            disabled={isExecuting || !areAllInputsFilled()}
            className="flex items-center gap-2"
          >
            <Play className="h-4 w-4" />
            {isExecuting ? 'Run...' : 'Run'}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Input section */}
        {/*{requiresInput && (
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
        )}*/}

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

        <div className="py-4">
          <Card className="border-none shadow-none p-0">
            <CardContent className="space-y-3">
              {nodes.map((node) => (
                <div key={node.id} className="flex items-center gap-4 px-4">
                  <div className="flex-shrink-0 py-3">
                    {getStepIcon(node.status)}
                  </div>
                  <div className={cn("flex-1 p-3 rounded-lg transition-colors", getNodeBackgroundColor(node.nodeType))}>
                    <div className="flex flex-col items-start text-left w-full">
                      <div className="text-sm text-muted-foreground">{node.nodeType || 'default'}</div>
                      <div className="text-base font-semibold text-foreground mb-1">{node.name}</div>
                      
                      {/* Input field for input type nodes */}
                      {node.nodeType?.toLowerCase().includes('input') && (
                        <div className="w-full mt-3">
                          <textarea
                            value={inputs[node.id] || ''}
                            onChange={(e) => setInputs(prev => ({
                              ...prev,
                              [node.id]: e.target.value
                            }))}
                            placeholder={`Enter ${node.nodeType === 'linkedinInput' ? 'LinkedIn profile HTML' : 'input'} here...`}
                            className="w-full h-32 p-3 rounded-md 
                              bg-white dark:bg-[hsl(240,10%,4%)]
                              border-2 border-gray-300 dark:border-slate-700
                              text-foreground 
                              focus:outline-none focus:border-gray-400 dark:focus:border-slate-500
                              focus:ring-2 focus:ring-gray-200 dark:focus:ring-slate-800
                              resize-none
                              transition-colors"
                            disabled={isExecuting}
                          />
                        </div>
                      )}

                      {/* Logs section */}
                      {node.logs.length > 0 && (
                        <div className="mt-2 bg-background/50 rounded-md p-3 w-full border border-border">
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
      </div>
    </div>
  )
}

