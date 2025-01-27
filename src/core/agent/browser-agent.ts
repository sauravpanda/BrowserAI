import { HTMLCleaner } from './html-cleaner';
import { identifyMainContent } from './content-identifier';
import { PageMetadata, ActionError, RetryConfig, BrowserAgentAction, AgentConfig, AgentModelConfig } from '@/core/agent/types';
import { BrowserAI } from '@/core/llm';

// CURRENTLY WIP

export class BrowserAgent {
    private currentUrl: string;
    private htmlCleaner: HTMLCleaner;
    private actionHistory: BrowserAgentAction[] = [];
    private retryConfig: RetryConfig = {
        maxRetries: 3,
        delay: 1000,
        backoffFactor: 1.5
    };
    private browserAI: BrowserAI;
    private config: AgentConfig;

    constructor(config: AgentConfig) {
        this.currentUrl = window.location.href;
        this.htmlCleaner = new HTMLCleaner();
        this.browserAI = new BrowserAI();
        this.config = config;
        this.initializeModels();
    }

    private async initializeModels() {
        // Load default model if specified
        if (this.config.defaultModel) {
            await this.browserAI.loadModel(this.config.defaultModel);
        }
    }

    private async getModelForTask(taskType: AgentModelConfig['taskType']): Promise<void> {
        const modelConfig = this.config.models[taskType];
        if (!modelConfig) {
            if (!this.config.defaultModel) {
                throw new Error(`No model configured for task type ${taskType}`);
            }
            return;
        }

        // Load the specific model for this task if it's different from current
        if (this.browserAI.currentModel?.modelName !== modelConfig.modelId) {
            await this.browserAI.loadModel(modelConfig.modelId, modelConfig.options);
        }
    }

    async executeAction(action: BrowserAgentAction): Promise<any> {
        try {
            this.actionHistory.push(action);
            return await this.executeWithRetry(() => this.performAction(action));
        } catch (error: unknown) {
            if (error instanceof Error) {
                throw new ActionError(action, error.message);
            }
            throw new ActionError(action, String(error));
        }
    }

    private async executeWithRetry(fn: () => Promise<any>, attempt = 1): Promise<any> {
        try {
            return await fn();
        } catch (error) {
            if (attempt >= this.retryConfig.maxRetries) {
                throw error;
            }
            
            const delay = this.retryConfig.delay * Math.pow(this.retryConfig.backoffFactor, attempt - 1);
            await this.wait(delay);
            return this.executeWithRetry(fn, attempt + 1);
        }
    }

    private async performAction(action: BrowserAgentAction): Promise<any> {
        this.validateAction(action);
        
        // If action requires AI, ensure correct model is loaded
        if (action.taskType) {
            await this.getModelForTask(action.taskType);
        }
        
        switch (action.type) {
            case 'click':
                return this.clickElement(action.target as string);
            case 'scroll':
                return this.scroll(action.value);
            case 'navigate':
                return this.navigate(action.target as string);
            case 'extract':
                return this.extractContent(action.target as string);
            case 'read':
                return this.readPageContent();
            case 'wait':
                return this.wait(action.value);
            case 'think':
                return this.makeDecision(action.value);
            case 'analyze':
                return this.analyzeContent(action.value);
            case 'classify':
                return this.classifyContent(action.value);
            case 'summarize':
                return this.summarizeContent(action.value);
        }
    }

    private validateAction(action: BrowserAgentAction): void {
        switch (action.type) {
            case 'click':
            case 'extract':
                if (!action.target) {
                    throw new Error(`${action.type} action requires a target selector`);
                }
                break;
            case 'scroll':
                if (!action.value?.direction || !action.value?.amount) {
                    throw new Error('Scroll action requires direction and amount');
                }
                break;
            case 'navigate':
                if (!action.target || !action.target.startsWith('http')) {
                    throw new Error('Navigate action requires a valid URL');
                }
                break;
        }
    }

    private async clickElement(selector: string): Promise<boolean> {
        const element = document.querySelector(selector);
        if (element && element instanceof HTMLElement) {
            element.click();
            return true;
        }
        return false;
    }

    private async scroll(options: { direction: 'up' | 'down', amount: number }): Promise<void> {
        window.scrollBy({
            top: options.direction === 'down' ? options.amount : -options.amount,
            behavior: 'smooth'
        });
    }

    private async navigate(url: string): Promise<void> {
        window.location.href = url;
    }

    private async extractContent(selector: string): Promise<string> {
        const element = document.querySelector(selector);
        return element ? this.htmlCleaner.clean(element.innerHTML) : '';
    }

    private async readPageContent(): Promise<{
        mainContent: string;
        semanticContent: string;
        metadata: PageMetadata;
    }> {
        const html = document.documentElement.innerHTML;
        return {
            mainContent: await this.getMainContent(html),
            semanticContent: this.htmlCleaner.cleanSemantic(html),
            metadata: this.extractMetadata()
        };
    }

    private async wait(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async getMainContent(html: string): Promise<string> {
        const cleanedText = this.htmlCleaner.clean(html);
        return identifyMainContent(cleanedText);
    }

    private extractMetadata(): PageMetadata {
        return {
            title: document.title,
            url: this.currentUrl,
            description: this.getMetaContent('description'),
            keywords: this.getMetaContent('keywords'),
            timestamp: new Date().toISOString()
        };
    }

    private getMetaContent(name: string): string {
        const meta = document.querySelector(`meta[name="${name}"]`);
        return meta ? meta.getAttribute('content') || '' : '';
    }

    private async makeDecision(context: string): Promise<{
        nextAction: BrowserAgentAction;
        reasoning: string;
    }> {
        await this.getModelForTask('decision');
        
        const prompt = `
        Context: ${context}
        Current URL: ${this.currentUrl}
        
        Analyze the context and decide the next action. 
        Respond in JSON format with:
        {
            "nextAction": {
                "type": "...",
                "target": "...",
                "value": "..."
            },
            "reasoning": "..."
        }
        `;

        const response = await this.browserAI.generateText(prompt);
        return JSON.parse(response as string);
    }

    private async analyzeContent(content: string): Promise<{
        summary: string;
        entities: string[];
        sentiment: string;
        topics: string[];
    }> {
        await this.getModelForTask('analysis');
        
        const prompt = `
        Analyze this content:
        ${content}
        
        Provide a detailed analysis including summary, entities, sentiment, and topics.
        Respond in JSON format.
        `;

        const response = await this.browserAI.generateText(prompt);
        return JSON.parse(response as string);
    }

    private async classifyContent(content: string): Promise<{
        type: string;
        confidence: number;
        categories: string[];
    }> {
        await this.getModelForTask('analysis');
        const response = await this.browserAI.generateText(`
            Classify this content: ${content}
            Respond in JSON format with type, confidence, and categories.
        `);
        return JSON.parse(response as string);
    }

    private async summarizeContent(content: string): Promise<{
        summary: string;
        keyPoints: string[];
    }> {
        await this.getModelForTask('analysis');
        const response = await this.browserAI.generateText(`
            Summarize this content: ${content}
            Respond in JSON format with summary and key points.
        `);
        return JSON.parse(response as string);
    }

    // Example usage with different models
    async performTask(goal: string): Promise<void> {
        // Read the page
        const content = await this.executeAction({ 
            type: 'read' 
        });

        // Analyze content using analysis model
        const analysis = await this.executeAction({ 
            type: 'analyze',
            value: content.mainContent,
            taskType: 'analysis'
        });

        // Make decision using decision model
        const decision = await this.executeAction({
            type: 'think',
            value: `Goal: ${goal}\nAnalysis: ${JSON.stringify(analysis)}`,
            taskType: 'decision'
        });

        // Execute the decided action
        await this.executeAction(decision.nextAction);
    }

    getActionHistory(): BrowserAgentAction[] {
        return [...this.actionHistory];
    }
}