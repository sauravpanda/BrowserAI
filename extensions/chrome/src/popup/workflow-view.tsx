import { useState, useEffect } from "react"
import { Play, CheckCircle2, Circle, XCircle, ChevronLeft, Check, ChevronDown, ChevronUp, Copy } from "lucide-react"
import { Button } from "../components/ui/button"
// import { ScrollArea } from "../components/ui/scroll-area"
import { Card, CardContent } from "../components/ui/card"
import { executeWorkflow, WorkflowStep, StepStatus, WorkflowResult } from "../helpers/executors"
import { toast } from "../components/ui/use-toast"
import { cn } from "../lib/utils"

interface AudioInputFile {
  type: 'file';
  file: File;
}

interface AudioInputText {
  type: 'text';
  value: string;
}

type AudioInput = AudioInputFile | AudioInputText;

interface WorkflowViewProps {
  workflow: {
    name: string;
    steps: WorkflowStep[];
  };
  onBack: () => void;
}

// Helper function to get input value
const getInputValue = (input: AudioInput | string | undefined): string => {
  if (!input) return '';
  if (typeof input === 'string') return input;
  if (input.type === 'text') return input.value;
  return input.file.name; // Return filename for file inputs
};

// Add helper function to convert File to base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = reader.result as string;
      // Remove the data URL prefix (e.g., "data:audio/wav;base64,")
      resolve(base64String.split(',')[1]);
    };
    reader.onerror = (error) => reject(error);
  });
};

export function WorkflowView({ workflow, onBack }: WorkflowViewProps) {
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionProgress, setExecutionProgress] = useState('')
  const [nodes, setNodes] = useState(workflow.steps)
  const [inputs, setInputs] = useState<Record<string, AudioInput | string>>({})
  const [finalOutput, setFinalOutput] = useState<string | null>(null)
  const [expandedInputs, setExpandedInputs] = useState<Record<string, boolean>>({})
  const [modelLoadProgress, setModelLoadProgress] = useState<number | null>(null);
  const [modelLoadEta, setModelLoadEta] = useState<number | null>(null);

  // Add this function to check for unsupported nodes
  const hasUnsupportedNodes = () => {
    return nodes.some(node => 
      node.nodeType?.toLowerCase() === 'ttsagent' || 
      node.nodeType?.toLowerCase() === 'transcriptionagent'
    );
  };

  // Get the unsupported node warning message
  const getUnsupportedWarningMessage = () => {
    const unsupportedTypes = nodes
      .filter(node => 
        node.nodeType?.toLowerCase() === 'ttsagent' || 
        node.nodeType?.toLowerCase() === 'transcriptionagent'
      )
      .map(node => node.nodeType?.toLowerCase() === 'ttsagent' ? 'Text-to-Speech' : 'Speech Transcription');
    
    const uniqueTypes = [...new Set(unsupportedTypes)];
    return `${uniqueTypes.join(' and ')} ${uniqueTypes.length > 1 ? 'are' : 'is'} not supported in the Chrome extension. Please use the web app version instead.`;
  };

  // Add helper functions to identify node types
  const isStringManipulationNode = (node: WorkflowStep) => 
    node.nodeType?.toLowerCase() === 'stringmanipulation';

  const isIfElseNode = (node: WorkflowStep) => 
    node.nodeType?.toLowerCase() === 'ifelse';

  const isWebhookNode = (node: WorkflowStep) => 
    node.nodeType?.toLowerCase() === 'webhook';

  const isOpenWebpageNode = (node: WorkflowStep) => 
    node.nodeType?.toLowerCase() === 'openwebpage';

  const isIteratorNode = (node: WorkflowStep) => 
    node.nodeType?.toLowerCase() === 'iterator';

  // Add this helper function to identify outputFormat nodes
  const isOutputFormatNode = (node: WorkflowStep) => 
    node.nodeType?.toLowerCase() === 'outputformat';

  useEffect(() => {
    console.debug('Workflow data received:', workflow);
    console.debug('Initial nodes:', nodes);
    // Add detailed logging for each node
    nodes.forEach(node => {
      console.debug(`Node ${node.id} details:`, {
        nodeType: node.nodeType,
        nodeData: node.nodeData,
        value: node.nodeData?.value,
        fullNodeData: JSON.stringify(node.nodeData, null, 2)
      });
    });
    
    // Show toast warning if workflow contains unsupported nodes
    if (hasUnsupportedNodes()) {
      toast({
        variant: "destructive",
        title: "Unsupported workflow",
        description: getUnsupportedWarningMessage()
      });
    }
  }, []);

  // Update areAllInputsFilled function
  const areAllInputsFilled = () => {
    return nodes
      .filter(node => node.nodeType?.toLowerCase().includes('input'))
      .every(node => {
        const input = inputs[node.id];
        if (!input) return false;
        if (typeof input === 'string') return input.trim().length > 0;
        if (input.type === 'file') return true; // File input is always considered filled
        return input.value.trim().length > 0;
      });
  };

  // Update handleExecute function
  const handleExecute = async () => {
    setIsExecuting(true);
    setExecutionProgress('');
    setModelLoadProgress(null);
    setModelLoadEta(null);

    try {
      // Process nodes and convert audio files to base64
      const updatedNodes = await Promise.all(nodes.map(async node => {
        const input = inputs[node.id];
        
        if (input && typeof input !== 'string' && input.type === 'file') {
          try {
            const base64Data = await fileToBase64(input.file);
            return {
              ...node,
              status: 'pending' as StepStatus,
              logs: [],
              data: {
                value: base64Data,
                filename: input.file.name,
                mimeType: input.file.type
              }
            };
          } catch (error) {
            throw new Error(`Failed to process audio file: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        return {
          ...node,
          status: 'pending' as StepStatus,
          logs: [],
          data: {
            value: getInputValue(input)
          }
        };
      }));

      const result: WorkflowResult = await executeWorkflow({
        nodes: updatedNodes as WorkflowStep[],
        onProgress: (progress: string) => {
          setExecutionProgress(progress);
        },
        onModelLoadProgress: (progress: number, eta: number) => {
          setModelLoadProgress(progress);
          setModelLoadEta(eta);
        },
        setNodes: (updatedNodes: WorkflowStep[]) => {
          setNodes(updatedNodes);
        }
      });

      if (result.success && result.finalOutput) {
        setFinalOutput(result.finalOutput);
      } else {
        toast({
          variant: "destructive",
          title: "Workflow execution failed"
        });
      }
    } catch (error: unknown) {
      console.error('Workflow execution failed:', error);
      toast({
        title: "Error executing workflow",
        description: error instanceof Error ? error.message : 'An unknown error occurred',
        variant: "destructive",
      });
    } finally {
      setIsExecuting(false);
    }
  };

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
      case 'stringmanipulation':
        return 'bg-gradient-to-r from-[#F2C36C] to-[#F5A769] dark:from-[#61431D] dark:to-[#5F3D1D]';
      case 'ifelse':
        return 'bg-gradient-to-r from-[#7A90F1] to-[#739AF3] dark:from-[#202761] dark:to-[#39456E]';
      case 'webhook':
        return 'bg-gradient-to-r from-[#C69EF7] to-[#D69ADE] dark:from-[#442966] dark:to-[#4F2956]';
      case 'openwebpage':
        return 'bg-gradient-to-r from-[#90DEB4] to-[#95E2A1] dark:from-[#2B503D] dark:to-[#3E6C43]';
      case 'iterator':
        return 'bg-gradient-to-r from-[#7ABCDF] to-[#9DE8F2] dark:from-[#213551] dark:to-[#2F555A]';
      default:
        return 'bg-gray-500/10 dark:bg-gray-500/20';
    }
  };

  // Add this helper function
  const formatNodeType = (nodeType: string | undefined): string => {
    if (!nodeType) return 'Default';
    
    return nodeType
      // Insert space before capital letters
      .replace(/([A-Z])/g, ' $1')
      // Capitalize first letter of entire string
      .replace(/^\w/, c => c.toUpperCase())
      // Remove any extra spaces
      .trim();
  };

  const toggleInputExpansion = (nodeId: string) => {
    setExpandedInputs(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  const hasPersistedInput = (node: WorkflowStep) => {
    // console.debug('Checking node for persisted input:', {
    //   nodeId: node.id,
    //   nodeType: node.nodeType,
    //   nodeData: node.nodeData,
    //   value: node.nodeData?.value,
    //   fullNode: node
    // });
    return node.nodeData?.value && node.nodeData.value.trim().length > 0;
  };

  // Update shouldShowContentSection to exclude outputFormat nodes completely
  const shouldShowContentSection = (node: WorkflowStep) => {
    // Don't show content section for outputFormat nodes at all
    if (isOutputFormatNode(node)) return false;
    
    const inputTypes = ['input', 'output', 'systemprompt', 'stringmanipulation', 'webhook', 'openwebpage', 'iterator']; 
    return inputTypes.some(type => node.nodeType?.toLowerCase().includes(type)) || 
           hasPersistedInput(node) || 
           isIfElseNode(node);
  };

  // Add helper to check if node is output type
  const isOutputNode = (node: WorkflowStep) => {
    return node.nodeType?.toLowerCase().includes('output');
  };

  // Add helper functions to identify node types
  const isAudioInputNode = (node: WorkflowStep) => 
    node.nodeType?.toLowerCase().includes('audioinput');

  const isAudioOutputNode = (node: WorkflowStep) => 
    node.nodeType?.toLowerCase().includes('audiooutput');

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        toast({
          variant: "default",
          title: "Copied to clipboard"
        })
      })
      .catch(err => {
        console.error('Could not copy text: ', err)
        toast({
          variant: "destructive",
          title: "Error copying to clipboard"
        })
      })
  }

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
          <Button 
            onClick={handleExecute}
            disabled={isExecuting || !areAllInputsFilled() || hasUnsupportedNodes()}
            className="flex items-center gap-2"
          >
            <Play className="h-4 w-4" />
            {isExecuting ? 'Run...' : 'Run'}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {hasUnsupportedNodes() && (
          <div className="p-3 bg-destructive/10 text-destructive text-sm mb-2 mx-4 mt-4 rounded-md">
            <strong>Warning:</strong> {getUnsupportedWarningMessage()}
          </div>
        )}

        {modelLoadProgress !== null && (
          <div className="p-2 bg-primary/10 text-primary text-sm sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-primary/20 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300 rounded-full"
                  style={{ width: `${modelLoadProgress}%` }}
                />
              </div>
              <span className="text-xs whitespace-nowrap">
                Downloading model: {Math.round(modelLoadProgress)}%
                {modelLoadEta !== null && modelLoadEta > 0 && (
                  ` (${modelLoadEta.toFixed(1)}s remaining)`
                )}
              </span>
            </div>
          </div>
        )}

        {executionProgress && (
          <div className="p-2 bg-primary/10 text-primary text-sm sticky top-0 z-10">
            {executionProgress}
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
                  <div className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className={cn(
                      "p-2 transition-colors",
                      getNodeBackgroundColor(node.nodeType)
                    )}>
                      <div className="flex flex-col items-start text-left w-full space-y-0.5">
                        <div className="text-xs text-muted-foreground">
                          {formatNodeType(node.nodeType)}
                        </div>
                        <div className="text-sm font-semibold text-foreground">
                          {node.name}
                        </div>
                      </div>
                    </div>

                    {shouldShowContentSection(node) && (
                      <div className="bg-white dark:bg-gray-900 p-3">
                        {/* String Manipulation Node */}
                        {isStringManipulationNode(node) && (
                          <div className="w-full">
                            {!node.logs.length ? (
                              <div className="text-sm text-muted-foreground text-left italic">
                                String operation: {node.nodeData?.operation || 'Not specified'}
                                {node.nodeData?.parameter && 
                                  <span className="ml-2">Parameter: {node.nodeData.parameter}</span>
                                }
                              </div>
                            ) : (
                              <div className="text-sm text-foreground text-left">
                                {node.nodeData?.value || 'Operation completed'}
                              </div>
                            )}
                          </div>
                        )}

                        {/* If-Else Node */}
                        {isIfElseNode(node) && (
                          <div className="w-full">
                            <div className="text-sm text-muted-foreground text-left">
                              Condition: {node.nodeData?.operator || 'equals'} {node.nodeData?.comparisonValue || ''}
                            </div>
                            {node.status === 'completed' && (
                              <div className="mt-1 text-sm font-medium text-left">
                                Result: <span className={node.nodeData?.result === 'true' ? 'text-green-500' : 'text-amber-500'}>
                                  {node.nodeData?.result === 'true' ? 'True' : 'False'}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Webhook Node */}
                        {isWebhookNode(node) && (
                          <div className="w-full">
                            <div className="text-sm text-muted-foreground text-left">
                              {node.nodeData?.method || 'GET'} {node.nodeData?.endpoint || 'No endpoint specified'}
                            </div>
                            {node.status === 'completed' && node.nodeData?.value && (
                              <div className="mt-2 text-sm text-foreground text-left overflow-hidden text-ellipsis">
                                Response: {node.nodeData.value.length > 50 
                                  ? node.nodeData.value.substring(0, 50) + '...' 
                                  : node.nodeData.value}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Open Webpage Node */}
                        {isOpenWebpageNode(node) && (
                          <div className="w-full">
                            <div className="text-sm text-muted-foreground text-left">
                              URL: {node.nodeData?.url || 'No URL specified'}
                            </div>
                            {node.status === 'completed' && (
                              <div className="mt-1 text-sm text-green-500 text-left">
                                Page opened in new tab
                              </div>
                            )}
                          </div>
                        )}

                        {/* Iterator Node */}
                        {isIteratorNode(node) && (
                          <div className="w-full">
                            <div className="text-sm text-muted-foreground text-left">
                              Items: {node.nodeData?.items?.length || 0} 
                              {node.nodeData?.items && node.nodeData.items.length > 0 && (
                                <span className="ml-2">
                                  (First: {String(node.nodeData.items[0]).substring(0, 20)}
                                  {String(node.nodeData.items[0]).length > 20 ? '...' : ''})
                                </span>
                              )}
                            </div>
                            {node.status === 'completed' && (
                              <div className="mt-1 text-sm text-amber-500 text-left">
                                Note: Full iteration requires the web app
                              </div>
                            )}
                          </div>
                        )}

                        {/* Audio Input Node */}
                        {isAudioInputNode(node) && (
                          <div className="w-full">
                            {!hasPersistedInput(node) ? (
                              <div className="flex flex-col items-center gap-2">
                                <input
                                  type="file"
                                  accept="audio/*"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      setInputs(prev => ({
                                        ...prev,
                                        [node.id]: {
                                          type: 'file',
                                          file: file
                                        }
                                      }));
                                    }
                                  }}
                                  className="hidden"
                                  id={`file-input-${node.id}`}
                                />
                                <label
                                  htmlFor={`file-input-${node.id}`}
                                  className="inline-flex items-center justify-center gap-2 text-sm text-primary hover:text-primary/90 cursor-pointer transition-colors py-2 px-4 rounded-md border border-primary hover:bg-primary/10 active:bg-primary/20 w-fit"
                                >
                                  Upload File
                                </label>
                                <div className="text-sm text-muted-foreground">
                                  {inputs[node.id] ? 
                                    `Selected file: ${(inputs[node.id] as AudioInputFile).file.name}` : 
                                    'No file uploaded'
                                  }
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-sm text-foreground">
                                  Audio file: {node.nodeData?.filename || "Uploaded audio"}
                                </div>
                                <button
                                  onClick={() => {
                                    setInputs(prev => {
                                      const newInputs = { ...prev };
                                      delete newInputs[node.id];
                                      return newInputs;
                                    });
                                  }}
                                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  Change
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Audio Output Node */}
                        {isAudioOutputNode(node) && (
                          <div className="w-full">
                            {!node.nodeData?.value ? (
                              <div className="text-sm text-muted-foreground italic">
                                Audio output will be rendered here
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                <audio
                                  controls
                                  src={node.nodeData.value}
                                  className="w-full"
                                />
                                <button
                                  onClick={() => {
                                    // Download audio file
                                    const link = document.createElement('a');
                                    link.href = node.nodeData?.value;
                                    link.download = node.nodeData?.filename || 'audio-output.mp3';
                                    link.click();
                                  }}
                                  className="text-sm text-primary hover:text-primary/90"
                                >
                                  Download
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Existing input/output handling */}
                        {!isAudioInputNode(node) && !isAudioOutputNode(node) && (
                          <div className="w-full">
                            {hasPersistedInput(node) && (
                              <div className="flex items-start justify-between gap-2">
                                <div className={cn(
                                  "text-base text-foreground overflow-hidden text-left",
                                  !expandedInputs[node.id] && "line-clamp-1"
                                )}>
                                  {node.nodeData?.value}
                                </div>
                                <div 
                                  onClick={() => toggleInputExpansion(node.id)}
                                  className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  {expandedInputs[node.id] ? (
                                    <ChevronUp className="h-4 w-4" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4" />
                                  )}
                                </div>
                              </div>
                            )}
                            
                            {!hasPersistedInput(node) && node.nodeType?.toLowerCase().includes('input') && (
                              <div className="w-full">
                                <textarea
                                  value={getInputValue(inputs[node.id])}
                                  onChange={(e) => setInputs(prev => ({
                                    ...prev,
                                    [node.id]: {
                                      type: 'text',
                                      value: e.target.value
                                    }
                                  }))}
                                  placeholder={`Enter ${node.nodeType === 'linkedinInput' ? 'LinkedIn profile HTML' : 'input'} here...`}
                                  className="w-full h-32 p-3 rounded-md text-base
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

                            {isOutputNode(node) && (
                              <div className="w-full">
                                {!node.logs.length && !node.data?.value ? (
                                  <div className="text-sm text-muted-foreground text-left italic">
                                    Output will be rendered here
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="text-base text-foreground text-left whitespace-pre-wrap flex-1">
                                        {node.data?.value || node.nodeData?.value || finalOutput}
                                      </div>
                                      <div 
                                        onClick={() => {
                                          copyToClipboard(node.data?.value || node.nodeData?.value || finalOutput || '');
                                          toast({
                                            title: "Copied to clipboard",
                                            duration: 1500,
                                            className: "text-xs" // Make toast message small and subtle
                                          });
                                        }}
                                        className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                                      >
                                        <Copy className="h-4 w-4" />
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {node.logs.length > 0 && !isOutputNode(node) && (
                              <div className="mt-2 space-y-1">
                                {node.logs.map((log, idx) => (
                                  <div key={idx} className="text-xs text-muted-foreground/50 flex items-start">
                                    <Check className="w-2.5 h-2.5 mt-0.5 mr-1" />
                                    <span className="flex-1 text-left">{log}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

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

