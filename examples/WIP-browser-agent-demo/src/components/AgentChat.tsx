import { useState } from 'react';
import { BrowserAgent } from '@browserai/browserai';
import { Send, Globe } from 'lucide-react';

interface Message {
  role: 'user' | 'agent';
  content: string;
}

interface AgentChatProps {
  currentUrl: string;
  onNavigate: (url: string) => void;
}

export default function AgentChat({ currentUrl, onNavigate }: AgentChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'agent', content: 'Hello! I can help you browse the web. Enter a URL or ask me anything!' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const agent = new BrowserAgent({
    models: {
      navigation: {
        taskType: 'navigation',
        modelId: 'llama-3.2-1b-instruct'
      },
      analysis: {
        taskType: 'analysis',
        modelId: 'gemma-2b-it'
      }
    },
    defaultModel: 'llama-3.2-1b-instruct'
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = { role: 'user' as const, content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Read current page
      const content = await agent.executeAction({ type: 'read' });
      
      // Analyze content
      const analysis = await agent.executeAction({
        type: 'analyze',
        value: content.mainContent,
        taskType: 'analysis'
      });

      // Get agent's decision
      const decision = await agent.executeAction({
        type: 'think',
        value: `User request: ${input}\nCurrent URL: ${currentUrl}\nAnalysis: ${JSON.stringify(analysis)}`,
        taskType: 'decision'
      });

      // Execute the decided action if it's a navigation action
      if (decision.nextAction.type === 'navigate' && decision.nextAction.target) {
        onNavigate(decision.nextAction.target);
      }

      const agentMessage = {
        role: 'agent' as const,
        content: decision.reasoning
      };
      setMessages(prev => [...prev, agentMessage]);
    } catch (error) {
      const errorMessage = {
        role: 'agent' as const,
        content: 'Sorry, I encountered an error while processing your request.'
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-1/3 flex flex-col bg-white border-r border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Globe className="w-6 h-6 text-blue-500" />
          Web Assistant
        </h1>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] p-3 rounded-lg ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 p-3 rounded-lg">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
              </div>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
}