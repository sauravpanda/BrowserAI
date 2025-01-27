export interface BrowserAgentAction {
    type: 'click' | 'scroll' | 'navigate' | 'extract' | 'read' | 'wait' | 
          'think' | 'analyze' | 'classify' | 'summarize';
    target?: string;
    value?: any;
    taskType?: AgentModelConfig['taskType'];
}

export interface PageMetadata {
    title: string;
    url: string;
    description: string;
    keywords: string;
    timestamp: string;
}

export interface RetryConfig {
    maxRetries: number;
    delay: number;
    backoffFactor: number;
}

export class ActionError extends Error {
    constructor(
        public action: BrowserAgentAction,
        message: string
    ) {
        super(`Failed to execute ${action.type}: ${message}`);
        this.name = 'ActionError';
    }
}

export interface AgentState {
    currentUrl: string;
    lastAction: BrowserAgentAction | null;
    actionHistory: BrowserAgentAction[];
    errors: ActionError[];
}

export interface AgentModelConfig {
    taskType: 'navigation' | 'analysis' | 'extraction' | 'decision' | 'conversation';
    modelId: string;
    options?: Record<string, unknown>;
}

export interface AgentConfig {
    models: {
        [key in AgentModelConfig['taskType']]?: AgentModelConfig;
    };
    defaultModel?: string;
}
