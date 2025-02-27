import { BrowserAI, HTMLCleaner } from "@browserai/browserai";

export interface WorkflowStep {
  id: string;
  name: string;
  status: StepStatus;
  logs: string[];
  nodeType?: string;
  nodeData?: Record<string, any>;
  data?: {
    value?: string;
    [key: string]: any;
  };
  style?: {
    background?: string;
    color?: string;
    border?: string;
    borderRadius?: string;
    padding?: string;
  };
}

export type StepStatus = 'pending' | 'running' | 'completed' | 'error';

interface ExecuteWorkflowParams {
  nodes: WorkflowStep[];
  onProgress?: (message: string) => void;
  onModelLoadProgress?: (progress: number, eta: number) => void;
  setNodes: (updater: any) => void;
  isTestMode?: boolean;
}

export interface WorkflowResult {
  success: boolean;
  data?: Record<string, any>;
  error?: any;
  finalOutput?: string;
}

// Node-specific executors
const nodeExecutors = {
  'readCurrentPage': async (node: WorkflowStep, input: any) => {
    try {
      console.debug("read-current-page", node, input)
      // Get the active tab's content
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url) {
        throw new Error('No active tab found');
      }

      // Request permission for the current tab's origin
      const url = new URL(tab.url);
      const origin = `${url.protocol}//${url.hostname}/*`;

      const granted = await new Promise((resolve) => {
        chrome.permissions.request({
          origins: [origin]
        }, (granted) => resolve(granted));
      });

      if (!granted) {
        throw new Error(`Permission denied for ${origin}`);
      }

      // Clean and check URL pattern
      const cleanUrl = tab.url.replace(/^https?:\/\//, '');
      const filterPath = node.nodeData?.filter_path || '*';

      // If filter_path is not empty or '*', check if URL matches the pattern
      if (filterPath !== '' && filterPath !== '*') {
        const pattern = filterPath.replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}`);
        if (!regex.test(cleanUrl)) {
          return {
            success: true,
            output: '',
            log: `Skipped: URL ${cleanUrl} does not match pattern ${filterPath}`
          };
        }
      }

      // Execute script to get page content
      const [{ result: pageContent }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => document.documentElement.outerHTML
      });
      console.debug("pageContent", pageContent)
      const cleaner = new HTMLCleaner();
      let cleanedContent = '';

      // Use filter path to determine cleaning method
      if (pageContent) {
        cleanedContent = cleaner.cleanSemantic(pageContent);
      }
      else {
        throw new Error("No page content found")
      }

      return {
        success: true,
        output: cleanedContent,
        log: 'Current page content read and cleaned successfully'
      };
    } catch (error) {
      console.error('Error reading page content:', error);
      throw error;
    }
  },

  'systemPrompt': async (node: WorkflowStep, input: any) => {
    // System prompt node passes through input but stores the prompt value
    // console.debug("system-prompt", node, input)
    return {
      success: true,
      output: `Guidelines: ${node.nodeData?.value}\n\nContext: ${input}`,
      log: 'System prompt processed'
    };
  },

  'chatAgent': async (node: WorkflowStep, input: any, params?: ExecuteWorkflowParams) => {
    try {
      const browserAI = new BrowserAI();

      await browserAI.loadModel(node.nodeData?.model || 'llama-3.2-1b-instruct', {
        onProgress: (progress: any) => {
          const progressPercent = progress.progress || 0;
          const eta = progress.eta || 0;
          params?.onModelLoadProgress?.(progressPercent * 100, eta);
        }
      });

      // Safely prepare the input
      let promptInput = '';
      if (typeof input === 'string') {
        promptInput = input;
      } else if (input && typeof input === 'object') {
        try {
          promptInput = JSON.stringify(input);
        } catch (e) {
          promptInput = String(input);
        }
      }

      // Use node's prompt if available, otherwise use the processed input
      const finalPrompt = node.nodeData?.prompt || promptInput;

      // Ensure the prompt is not too large (add a reasonable limit)
      const maxPromptLength = (node.nodeData?.maxTokens || 2048) * 3.6; // Adjust this value based on your model's requirements
      const truncatedPrompt = finalPrompt.slice(0, maxPromptLength);

      console.debug("Main Prompt", truncatedPrompt)
      const result = await browserAI.generateText(
        truncatedPrompt,
        {
          temperature: node.nodeData?.temperature || 0.7,
          max_tokens: node.nodeData?.maxTokens || 2048,
          system_prompt: node.nodeData?.systemPrompt,
          json_schema: node.nodeData?.outputFormat
        }
      );

      return {
        success: true,
        output: result,
        log: 'Chat agent completed successfully'
      };
    } catch (error) {
      console.error('ChatAgent error:', error);
      throw error;
    }
  },

  'database': async (node: WorkflowStep, input: any) => {
    // Placeholder for database operations
    const { databaseType, databaseAction } = node.nodeData || {};
    return {
      success: true,
      output: input,
      log: `Database operation (${databaseAction}) completed on ${databaseType}`
    };
  },

  'textInput': async (node: WorkflowStep, input: any) => {
    console.debug("input-text", node, input)
    return {
      success: true,
      output: input,
      log: 'Input text processed successfully'
    };
  },

  'textOutput': async (node: WorkflowStep, input: any) => {
    console.debug("output", node, input)
    return {
      success: true,
      output: input,
      log: 'Output processed successfully'
    };
  },

  'audioInput': async (node: WorkflowStep, input: any) => {
    console.debug("audio-input", node, input);
    // The audio data is already in base64 format in node.data.value
    return {
      success: true,
      output: {
        audioData: node.data?.value,
        filename: node.data?.filename,
        mimeType: node.data?.mimeType
      },
      log: 'Audio input processed successfully'
    };
  },

  'transcriptionAgent': async (node: WorkflowStep, input: any, params?: ExecuteWorkflowParams) => {
    try {
      console.debug("transcription-agent", node, input);
      
      // Throw a specific error for speech transcription in Chrome extension
      throw new Error("Speech transcription models are not supported in the Chrome extension. Please use the web app version instead.");
      
      // The code below will not execute due to the error above
      const browserAI = new BrowserAI();

      await browserAI.loadModel(node.nodeData?.model || 'whisper-tiny-en', {
        onProgress: (progress: any) => {
          const progressPercent = progress.progress || 0;
          const eta = progress.eta || 0;
          params?.onModelLoadProgress?.(progressPercent * 100, eta);
        }
      });

      // Extract audio data from input
      if (!input?.audioData) {
        throw new Error('No audio data provided to transcription agent');
      }

      // Transcribe the audio
      const transcription = await browserAI.transcribeAudio(input.audioData, {
        model: node.nodeData?.model || 'whisper-tiny-en',
        // Add any additional options here
      });

      return {
        success: true,
        output: transcription,
        log: `Audio transcribed successfully using ${node.nodeData?.model || 'whisper-tiny-en'}`
      };
    } catch (error) {
      console.error('TranscriptionAgent error:', error);
      throw error;
    }
  },

  'ttsAgent': async (node: WorkflowStep, input: any, params?: ExecuteWorkflowParams) => {
    try {
      console.debug("tts-agent", node, input);
      
      // Throw a specific error for TTS in Chrome extension
      throw new Error("Text-to-speech models are not supported in the Chrome extension. Please use the web app version instead.");
      
      // The code below will not execute due to the error above
      const browserAI = new BrowserAI();

      await browserAI.loadModel(node.nodeData?.model || 'kokoro-tts', {
        onProgress: (progress: any) => {
          const progressPercent = progress.progress || 0;
          const eta = progress.eta || 0;
          params?.onModelLoadProgress?.(progressPercent * 100, eta);
        }
      });

      // Extract text input
      if (!input) {
        throw new Error('No text input provided to TTS agent');
      }

      // Generate speech
      const audioData = await browserAI.textToSpeech(input, {
        voice: node.nodeData?.voice || 'af_bella'
      });
      
      // Create blob with proper MIME type
      const blob = new Blob([audioData], { type: 'audio/wav' });
      
      // Create and store blob URL
      const audioUrl = URL.createObjectURL(blob);

      return {
        success: true,
        output: audioUrl,
        log: `Text-to-speech generated successfully using ${node.nodeData?.model || 'bark-small'}`
      };
    } catch (error) {
      console.error('TTSAgent error:', error);
      throw error;
    }
  },
};

export const executeWorkflow = async ({
  nodes,
  onProgress,
  onModelLoadProgress,
  setNodes,
}: ExecuteWorkflowParams): Promise<WorkflowResult> => {
  try {
    // Reset all nodes to pending with theme-aware styling
    setNodes((prev: WorkflowStep[]) =>
      prev.map(node => ({
        ...node,
        status: 'pending',
        logs: [],
        style: {
          background: 'var(--background)',
          color: 'var(--foreground)',
          border: '1px solid var(--border)'
        }
      }))
    );

    let workflowData: Record<string, any> = {};

    // Get the first node's input if it exists
    const firstNode = nodes[0];
    if (firstNode?.nodeType?.toLowerCase().includes('input')) {
      const inputValue = firstNode.data?.value;
      console.debug('First Node Input Value:', inputValue);

      // Store with a default key if no identifier/outputType
      workflowData['input'] = inputValue;

      if (firstNode.nodeData?.identifier) {
        workflowData[firstNode.nodeData.identifier] = inputValue;
      }
      if (firstNode.nodeData?.outputType) {
        workflowData[firstNode.nodeData.outputType] = inputValue;
      }

      console.debug('Initial workflowData:', workflowData);
    }

    let lastOutput = null;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      console.debug(`\n--- Executing node: ${node.name} ---`);
      //   console.debug("Node parameters:", node.nodeData);
      //   console.debug("Current workflowData:", workflowData);

      // Update current node to running
      setNodes((prev: WorkflowStep[]) =>
        prev.map(n =>
          n.id === node.id
            ? {
              ...n,
              status: 'running',
              logs: [...n.logs, `Starting ${n.name}...`]
            }
            : n
        )
      );

      if (onProgress) {
        onProgress(`Executing ${node.name}...`);
      }

      try {
        console.log("node", node)
        const executor = nodeExecutors[node.nodeType as keyof typeof nodeExecutors];
        if (!executor) {
          throw new Error(`No executor found for node type: ${node.nodeType}`);
        }

        // Prepare input based on node parameters
        let nodeInput: any = null;
        if (i === 0) {
          // For first node, always use its data.value
          nodeInput = node.data?.value;
        } else {
          nodeInput = lastOutput;
        }

        console.debug("Final nodeInput:", nodeInput);

        const result = await executor(node, nodeInput, { onProgress, onModelLoadProgress, setNodes, nodes });
        console.debug("Node execution result:", result);

        // Store output in workflow data
        if (result.output !== undefined) {
          // Always store with a default key
          workflowData['output'] = result.output;
          lastOutput = result.output;
          if (node.nodeData?.identifier) {
            workflowData[node.nodeData.identifier] = result.output;
          }
          if (node.nodeData?.outputType) {
            workflowData[node.nodeData.outputType] = result.output;
          }

          console.debug("Updated workflowData:", workflowData);
        }

        // Update node status and logs with theme-aware styling
        setNodes((prev: WorkflowStep[]) =>
          prev.map(n =>
            n.id === node.id
              ? {
                ...n,
                status: 'completed',
                logs: [...n.logs, result.log],
                style: {
                  background: 'var(--background)',
                  color: 'var(--foreground)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '1rem'
                }
              }
              : n
          )
        );
      } catch (error) {
        console.error(`Error executing node ${node.name}:`, error);
        setNodes((prev: WorkflowStep[]) =>
          prev.map(n =>
            n.id === node.id
              ? {
                ...n,
                status: 'error',
                logs: [...n.logs, `Error: ${error}`],
                style: {
                  background: 'var(--destructive)',
                  color: 'var(--destructive-foreground)',
                  border: '1px solid var(--destructive)',
                  borderRadius: 'var(--radius)',
                  padding: '1rem'
                }
              }
              : n
          )
        );
        throw error;
      }
    }

    // Get the final output from the last node
    const finalOutput = lastOutput;

    return {
      success: true,
      data: workflowData,
      finalOutput
    };
  } catch (error) {
    console.error('Workflow execution failed:', error);
    return { success: false, error };
  }
};