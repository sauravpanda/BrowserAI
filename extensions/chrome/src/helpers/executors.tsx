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
      output: `Guidelines: ${node.nodeData?.value}\n\n${input}`,
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

      // Get the system prompt
      let systemPrompt = node.nodeData?.systemPrompt || '';
      let jsonSchemaStr = '';
      // If we have a JSON schema from an OutputFormat node, add it to the system prompt
      if (node.nodeData?.jsonSchema) {
        console.debug("Using JSON schema in chatAgent:", node.nodeData.jsonSchema);
        jsonSchemaStr = typeof node.nodeData.jsonSchema === 'string' 
          ? node.nodeData.jsonSchema 
          : JSON.stringify(node.nodeData.jsonSchema, null, 2);
        
        // Add the JSON schema to the system prompt
        systemPrompt += `\n\nYou MUST format your response according to this JSON schema:\n${jsonSchemaStr}`;
      }

      // Use node's prompt if available, otherwise use the processed input
      const finalPrompt = node.nodeData?.prompt || promptInput;

      // Estimate token usage for system prompt and JSON schema
      const systemPromptTokens = Math.ceil(systemPrompt.length / 4);
      const jsonSchemaTokens = Math.ceil(jsonSchemaStr.length / 4);
      const reservedTokens = systemPromptTokens + jsonSchemaTokens;

      const overheadTokens = 100; // For model instructions and formatting

      // Calculate available tokens for the main prompt
      const contextSize = 4096; // Standard context size for most models
      const availableTokens = contextSize - reservedTokens - overheadTokens;

      // Convert to character limit (rough estimation)
      const maxPromptLength = Math.max(1000, availableTokens * 3); // Ensure at least 1000 chars

      console.debug("Token budget calculation:");
      console.debug("- System prompt tokens (est):", systemPromptTokens);
      console.debug("- JSON schema tokens (est):", jsonSchemaTokens);
      console.debug("- Overhead:", overheadTokens);
      console.debug("- Available for main prompt:", availableTokens);
      console.debug("- Max prompt length (chars):", maxPromptLength);

      let truncatedPrompt = finalPrompt;

      if (finalPrompt.length > maxPromptLength) {
        // Add a note about truncation
        const truncationNote = "\n[Note: Input was truncated due to length constraints]\n";
        truncatedPrompt = finalPrompt.slice(0, maxPromptLength - truncationNote.length);
      }

      console.debug("Main Prompt Length:", truncatedPrompt.length);
      console.debug("Main Prompt (truncated):", truncatedPrompt.slice(0, 100) + "...");

      let result = '';

      // Update node with streaming status
      params?.setNodes?.((prev: WorkflowStep[]) =>
        prev.map(n =>
          n.id === node.id
            ? {
              ...n,
              logs: [...(n.logs || []), 'Streaming response...']
            }
            : n
        )
      );

      // Find any textOutput nodes that come after this node and mark them as running
      const allNodes = params?.nodes || [];
      const currentNodeIndex = allNodes.findIndex(n => n.id === node.id);
      if (currentNodeIndex >= 0) {
        const textOutputNodes = allNodes
          .slice(currentNodeIndex + 1)
          .filter(n => n.nodeType === 'textOutput');
        
        if (textOutputNodes.length > 0) {
          params?.setNodes?.((prev: WorkflowStep[]) =>
            prev.map(n =>
              textOutputNodes.some(ton => ton.id === n.id)
                ? {
                  ...n,
                  status: 'running',
                  logs: [...(n.logs || []), 'Receiving streaming content...'],
                  data: { ...n.data, value: 'Waiting for content...' }
                }
                : n
            )
          );
        }
      }

      const chunks = await browserAI.generateText(
        truncatedPrompt,
        {
          temperature: node.nodeData?.temperature || 0.7,
          max_tokens: node.nodeData?.maxTokens || 2048,
          system_prompt: systemPrompt,
          json_schema: jsonSchemaStr,
          stream: true
        }
      );

      for await (const chunk of chunks as AsyncIterable<{
        choices: Array<{ delta: { content?: string } }>,
        usage: any
      }>) {
        // Get the new content from the chunk
        const newContent = chunk.choices[0]?.delta.content || '';
        result += newContent;

        // Update the node with the current result
        if (newContent) {
          params?.setNodes?.((prev: WorkflowStep[]) => {
            // Update current node
            const updatedNodes = prev.map(n =>
              n.id === node.id
                ? {
                    ...n,
                    data: { ...n.data, value: result }
                  }
                : n
            );
            
            // Find any textOutput nodes that come after this node and update them too
            const currentNodeIndex = prev.findIndex(n => n.id === node.id);
            if (currentNodeIndex >= 0) {
              return prev.map((n, index) => {
                if (index > currentNodeIndex && n.nodeType === 'textOutput') {
                  return {
                    ...n,
                    data: { ...n.data, value: result }
                  };
                }
                return updatedNodes.find(node => node.id === n.id) || n;
              });
            }
            
            return updatedNodes;
          });
        }
      }

      return {
        success: true,
        output: result,
        log: 'Chat agent completed successfully (streaming)'
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
    // Handle context from previous node
    const context = input ? String(input) : '';
    const value = node.data?.value || '';

    // Combine value and context
    const finalOutput = value
      ? (context ? `${value}\n${context}` : value)
      : context;
    return {
      success: true,
      output: `Input text: ${finalOutput}`,
      log: 'Input text processed successfully'
    };
  },

  'textOutput': async (node: WorkflowStep, input: any) => {
    console.debug("output", node, input);
    
    // If there's streaming content from a previous node, use it
    if (node.data?.streamingValue) {
      return {
        success: true,
        output: node.data.streamingValue,
        log: 'Output processed successfully (streaming)'
      };
    }
    
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

  'stringManipulation': async (node: WorkflowStep, input: any) => {
    try {
      if (!input) {
        throw new Error('No input provided');
      }

      const inputStr = String(input);
      let result = inputStr;

      switch (node.nodeData?.operation) {
        case 'split':
          result = inputStr.split(node.nodeData.parameter).join('\n');
          break;
        case 'slice':
          const [start, end] = node.nodeData.parameter.split(',').map(Number);
          result = inputStr.slice(start, end);
          break;
        case 'replace':
          const [find, replace] = node.nodeData.parameter.split(',');
          result = inputStr.replace(new RegExp(find, 'g'), replace);
          break;
        case 'trim':
          result = inputStr.trim();
          break;
        case 'uppercase':
          result = inputStr.toUpperCase();
          break;
        case 'lowercase':
          result = inputStr.toLowerCase();
          break;
        case 'substring':
          const [subStart, length] = node.nodeData.parameter.split(',').map(Number);
          result = inputStr.substr(subStart, length);
          break;
        default:
          throw new Error('Invalid operation');
      }

      return {
        success: true,
        output: result,
        log: `String manipulation (${node.nodeData?.operation}) completed successfully`
      };
    } catch (error) {
      console.error('Error in string manipulation node:', error);
      throw error;
    }
  },

  'ifElse': async (node: WorkflowStep, input: any) => {
    try {
      const inputStr = String(input || '');
      const operator = node.nodeData?.operator;
      const comparisonValue = node.nodeData?.comparisonValue;
      let result = false;

      switch (operator) {
        case 'equals':
          result = inputStr === comparisonValue;
          break;
        case 'notEquals':
          result = inputStr !== comparisonValue;
          break;
        case 'greaterThan':
          result = Number(inputStr) > Number(comparisonValue);
          break;
        case 'lessThan':
          result = Number(inputStr) < Number(comparisonValue);
          break;
        case 'contains':
          result = inputStr.includes(comparisonValue);
          break;
        case 'notContains':
          result = !inputStr.includes(comparisonValue);
          break;
        default:
          result = false;
      }

      return {
        success: true,
        output: input,
        handle: result ? 'true' : 'false',
        log: `Condition evaluated to ${result ? 'true' : 'false'}`
      };
    } catch (error) {
      console.error('Error in if-else node:', error);
      throw error;
    }
  },

  'webhook': async (node: WorkflowStep, input: any) => {
    try {
      const endpoint = node.nodeData?.endpoint;
      const method = node.nodeData?.method;
      const authKey = node.nodeData?.authKey;
      const inputData = input;

      if (!endpoint) {
        throw new Error('Webhook endpoint is required');
      }

      if (!method) {
        throw new Error('HTTP method is required');
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (authKey) {
        headers['Authorization'] = authKey;
      }

      // Use fetch instead of axios in the Chrome extension
      let response;
      if (method.toLowerCase() === 'get') {
        const url = new URL(endpoint);
        if (inputData) {
          url.searchParams.append('input', String(inputData));
        }
        response = await fetch(url.toString(), { headers });
      } else {
        response = await fetch(endpoint, {
          method: method.toLowerCase(),
          headers,
          body: inputData ? JSON.stringify(inputData) : undefined
        });
      }

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      return {
        success: true,
        output: JSON.stringify(result),
        log: `Webhook (${method} to ${endpoint}) completed successfully`
      };
    } catch (error) {
      console.error('Error in webhook node:', error);
      throw error;
    }
  },

  'openWebpage': async (node: WorkflowStep, input: any) => {
    try {
      // Check if URL is provided
      if (!node.nodeData?.url) {
        throw new Error('URL is required to open a webpage');
      }

      // Use Chrome extension API to open a new tab with the URL
      await chrome.tabs.create({ url: node.nodeData.url });

      // Pass through any input as output for workflow continuity
      return {
        success: true,
        output: input,
        log: `Opened webpage: ${node.nodeData?.url}`
      };
    } catch (error) {
      console.error('Error opening webpage:', error);
      throw error;
    }
  },

  'outputFormat': async (node: WorkflowStep, input: any, params?: ExecuteWorkflowParams) => {
    try {
      // Get the value from node data or use input if available
      const value = node.data?.value || input || '';
      
      // Only process JSON format
      try {
        // Test if valid JSON
        const parsedJson = JSON.parse(typeof value === 'string' ? value : JSON.stringify(value));
        
        // Update node with formatted output
        params?.setNodes?.((prev: WorkflowStep[]) =>
          prev.map(n =>
            n.id === node.id ? { 
              ...n, 
              data: { ...n.data, output: value },
              logs: [...(n.logs || []), 'JSON schema validated successfully']
            } : n
          )
        );
        
        return {
          success: true,
          output: value,
          log: 'JSON schema validated successfully',
          // Store the parsed JSON schema for use by chatAgent
          jsonSchema: parsedJson
        };
      } catch (e) {
        console.error('Error in output format node:', e);
        
        // Update node with error state
        params?.setNodes?.((prev: WorkflowStep[]) =>
          prev.map(n =>
            n.id === node.id ? { 
              ...n, 
              data: { ...n.data, hasError: true },
              logs: [...(n.logs || []), 'Invalid JSON format']
            } : n
          )
        );
        
        return {
          success: false,
          output: value, // Still pass through the value
          log: 'Invalid JSON format'
        };
      }
    } catch (error) {
      console.error('Error in output format node:', error);
      throw error;
    }
  },

  'iterator': async (node: WorkflowStep, input: any) => {
    try {
      // Combine input with items if present
      const items = input ? [input, ...(node.nodeData?.items || [])] : (node.nodeData?.items || []);
      if (items.length === 0) {
        return {
          success: true,
          output: null,
          log: 'No items to iterate'
        };
      }

      // In the Chrome extension, we'll handle iteration differently
      // Just return the first item and a note that iteration is limited
      return {
        success: true,
        output: items[0],
        log: 'Iterator processed first item (note: full iteration requires the web app)'
      };
    } catch (error) {
      console.error('Error in iterator node:', error);
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
    // First, preprocess the nodes to merge OutputFormat nodes with subsequent ChatAgent nodes
    let processedNodes = [...nodes];
    let outputFormatSchemas: Record<string, any> = {};
    
    // Find all OutputFormat nodes and store their schemas
    for (let i = 0; i < processedNodes.length; i++) {
      const node = processedNodes[i];
      if (node.nodeType === 'outputFormat') {
        try {
          // Parse the schema from the node
          const schemaValue = node.data?.value || node.nodeData?.value;
          if (schemaValue) {
            const parsedSchema = typeof schemaValue === 'string' 
              ? JSON.parse(schemaValue) 
              : schemaValue;
            
            // Store the schema with the node ID
            outputFormatSchemas[node.id] = parsedSchema;
            console.debug(`Stored schema from OutputFormat node ${node.id}:`, parsedSchema);
          }
        } catch (error) {
          console.error(`Failed to parse schema from OutputFormat node ${node.id}:`, error);
        }
      }
    }
    
    // Find the next ChatAgent node after each OutputFormat node
    for (let i = 0; i < processedNodes.length; i++) {
      if (processedNodes[i].nodeType === 'outputFormat') {
        // Look for the next ChatAgent node
        for (let j = i + 1; j < processedNodes.length; j++) {
          if (processedNodes[j].nodeType === 'chatAgent') {
            // Merge the schema into the ChatAgent node
            const schema = outputFormatSchemas[processedNodes[i].id];
            if (schema) {
              processedNodes[j] = {
                ...processedNodes[j],
                nodeData: {
                  ...processedNodes[j].nodeData,
                  jsonSchema: schema
                }
              };
              console.debug(`Merged schema into ChatAgent node ${processedNodes[j].id}`);
            }
            break; // Only merge with the first ChatAgent node found
          }
        }
      }
    }
    
    // Filter out OutputFormat nodes for execution
    const executableNodes = processedNodes.filter(node => node.nodeType !== 'outputFormat');
    console.debug(`Removed ${processedNodes.length - executableNodes.length} OutputFormat nodes for execution`);
    
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
    const firstNode = executableNodes[0];
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
    for (let i = 0; i < executableNodes.length; i++) {
      const node = executableNodes[i];
      console.debug(`\n--- Executing node: ${node.name} ---`);
      let jsonSchemaStr = '';

      if (node.nodeType === 'outputFormat') {
        console.debug("node.nodeData?", node.nodeData);
        jsonSchemaStr = node.nodeData?.jsonSchema;

        // Find the next chatAgent node
        for (let j = i + 1; j < executableNodes.length; j++) {
          if (executableNodes[j].nodeType === 'chatAgent') {
            executableNodes[j] = { ...executableNodes[j], nodeData: { ...executableNodes[j].nodeData, jsonSchema: jsonSchemaStr } };
          }
        }
        continue;
      }
      // Find the original node in the full nodes array
      const originalNodeIndex = nodes.findIndex(n => n.id === node.id);
      if (originalNodeIndex === -1) continue;

      // Update current node to running
      setNodes((prev: WorkflowStep[]) =>
        prev.map(n =>
          n.id === node.id
            ? {
              ...n,
              status: 'running',
              logs: [...(n.logs || []), `Starting ${n.name}...`]
            }
            : n
        )
      );

      if (onProgress) {
        onProgress(`Executing ${node.name}...`);
      }

      try {
        console.debug("node", node);
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

        // Special handling for textOutput nodes that follow a chatAgent
        if (node.nodeType === 'textOutput' && i > 0 && executableNodes[i-1].nodeType === 'chatAgent') {
          setNodes((prev: WorkflowStep[]) =>
            prev.map(n =>
              n.id === node.id
                ? {
                  ...n,
                  status: 'running',
                  logs: [...(n.logs || []), 'Receiving streaming content...']
                }
                : n
            )
          );
        }

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
                logs: [...(n.logs || []), result.log || ''],
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
                logs: [...(n.logs || []), `Error: ${error instanceof Error ? error.message : String(error)}`],
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
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
};