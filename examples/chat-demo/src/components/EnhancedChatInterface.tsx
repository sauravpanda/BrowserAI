import React, { useState, useRef } from 'react';
import { BarChart2, Send, AlertCircle, X } from 'lucide-react';
import { MessageContent } from './MessageContent';

const CustomAlert = ({ onClose, children }: { onClose: () => void; children: React.ReactNode }) => (
  <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
    <div className="flex justify-between items-center">
      <div className="flex items-center gap-2">
        <AlertCircle className="w-5 h-5 text-blue-400" />
        <div className="text-gray-300">{children}</div>
      </div>
      <button 
        onClick={onClose}
        className="text-gray-400 hover:text-gray-200"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  </div>
);

const MessageBubble: React.FC<{ 
    message: { text: string; isUser: boolean }
  }> = ({ message }) => (
    <div className={`flex ${message.isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[70%] rounded-lg p-3 ${
        message.isUser ? 'bg-blue-600' : 'bg-gray-700'
      }`}>
        <div className="text-sm">
            <MessageContent content={message.text} usage={message.usage} />
        </div>
        <div className="text-xs text-gray-400 mt-1">
          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );

interface EnhancedChatInterfaceProps {
  stats: {
    memoryUsage: number;
    maxMemory: number;
    lastDecodingTime: number;
    tokensPerSecond: number;
    modelLoadTime: number;
    peakMemoryUsage: number;
    responseHistory: number[];
  };
  messages: Array<{ text: string; isUser: boolean }>;
  input: string;
  modelLoaded: boolean;
  selectedModel: string;
  loading: boolean;
  loadingProgress?: number;
  loadingStats?: {
    progress: number;
    estimatedTimeRemaining: number | null;
  };
  showPrivacyBanner?: boolean;
  onSend: () => void;
  onInputChange: (value: string) => void;
  onModelChange: (model: string) => void;
  onLoadModel: () => void;
}

const EnhancedChatInterface = ({
    stats,
    messages,
    input,
    modelLoaded,
    selectedModel,
    loading,
    loadingProgress = 0,
    loadingStats = { progress: 0, estimatedTimeRemaining: null },
    showPrivacyBanner = true,
    onSend,
    onInputChange,
    onModelChange,
    onLoadModel
  }: EnhancedChatInterfaceProps) => {
  const [showStats, setShowStats] = useState(true);
  const [showMetricsInfo, setShowMetricsInfo] = useState(true);
  const chatBoxRef = useRef<HTMLDivElement>(null);

  const formatTimestamp = () => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  };


  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* GitHub Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 py-2 px-4 text-center">
        <a 
          href="https://github.com/sauravpanda/browserai"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white hover:text-gray-200 flex items-center justify-center gap-2"
        >
          ⭐ Star BrowserAI on GitHub and help us improve it!
        </a>
      </div>

      {/* Header Section */}
      <header className="py-6 px-4 border-b border-gray-800">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-center mb-4">BrowserAI Chat Demo</h1>
          <p className="text-gray-400 text-center mb-6">
            A simple chat interface built using BrowserAI - Run AI models directly in your browser!
          </p>
          
          {/* Model Selection & Controls */}
          <div className="flex flex-wrap items-center justify-center gap-4">
            <select 
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
              value={selectedModel}
              onChange={(e) => onModelChange(e.target.value)}
              disabled={loading}
            >
              <option value="smollm2-135m-instruct">SmolLM2 135M Instruct (360MB)</option>
              <option value="smollm2-360m-instruct">SmolLM2 360M Instruct (380MB)</option>
              <option value="deepseek-r1-distill-qwen-7b">DeepSeek R1 Distill Qwen 7B (5.1GB)</option>
              <option value="deepseek-r1-distill-llama-8b">DeepSeek R1 Distill Llama 8B (6.1GB)</option>
              <option value="smollm2-1.7b-instruct">SmolLM2 1.7B Instruct (1.75GB)</option>
              <option value="llama-3.2-1b-instruct">Llama 3.2 1B Instruct (880MB)</option>
              <option value="phi-3.5-mini-instruct">Phi 3.5 Mini Instruct (3.6GB)</option>
              <option value="qwen2.5-0.5b-instruct">Qwen2.5 0.5B Instruct (950MB)</option>
              <option value="qwen2.5-1.5b-instruct">Qwen2.5 1.5B Instruct (1.6GB)</option>
              <option value="gemma-2b-it">Gemma 2B Instruct (1.4GB)</option>
              <option value="tinyllama-1.1b-chat-v0.4">TinyLlama 1.1B Chat (670MB)</option>
              {/* <option value="deepseek-r1-distill-qwen-1.5b">DeepSeek R1 Distill Qwen 1.5B (1.5GB)</option> */}
            </select>
            <button 
              className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg transition-colors"
              onClick={onLoadModel}
              disabled={loading || modelLoaded}
            >
              {loading ? 'Loading...' : modelLoaded ? 'Model Loaded' : 'Load Model'}
            </button>
            <div className="flex items-center gap-2 px-4 py-1 rounded-full bg-gray-800 border border-gray-700">
              <div className={`w-2 h-2 rounded-full ${modelLoaded ? 'bg-green-500' : 'bg-gray-500'}`}></div>
              <span className="text-sm">{modelLoaded ? 'Model Ready' : 'Model Not Loaded'}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Metrics Info Banner
      {showMetricsInfo && showPrivacyBanner && (
        <div className="max-w-7xl mx-auto px-4 mt-4">
          <CustomAlert onClose={() => setShowMetricsInfo(false)}>
            We collect anonymous performance metrics to improve our service
          </CustomAlert>
        </div>
      )} */}

      {/* Main Chat Area */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Current Model Banner */}
        <div className="bg-gradient-to-r from-gray-800 to-gray-900 rounded-lg p-4 mb-6">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${modelLoaded ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></div>
              <span className="text-lg font-medium">Current Model: {selectedModel}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span>Status:</span>
              <span className={modelLoaded ? 'text-green-400' : 'text-gray-400'}>
                {loading ? 'Loading...' : modelLoaded ? 'Active' : 'Not Loaded'}
              </span>
            </div>
          </div>
          
          {/* Show progress bar only when loading */}
          {loading && (
            <div className="mt-4">
              <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden mb-2">
                <div 
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${loadingProgress}%` }}
                />
              </div>
              <div className="flex justify-between text-sm text-gray-400">
                <span>{loadingProgress.toFixed(0)}% complete</span>
                {loadingStats.estimatedTimeRemaining !== null && (
                  <span>
                    {loadingStats.estimatedTimeRemaining > 60 
                      ? `~${(loadingStats.estimatedTimeRemaining / 60).toFixed(1)} minutes remaining`
                      : `~${Math.ceil(loadingStats.estimatedTimeRemaining)} seconds remaining`
                    }
                  </span>
                )}
              </div>
              {selectedModel.includes('instruct') && (
                <div className="text-sm text-gray-500 mt-2">
                  This model includes instruction tuning for better chat responses
                </div>
              )}
            </div>
          )}
        </div>

        {/* Main chat interface - now always visible */}
        <div className={`flex transition-all duration-300 ${showStats ? 'gap-6' : 'gap-0'}`}>
          {/* Chat Section */}
          <div className={`flex-1 transition-all duration-300 ${showStats ? 'w-3/4' : 'w-full'}`}>            
          <div className="bg-gray-800 rounded-lg h-[600px] mb-4 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-gray-600" ref={chatBoxRef}>
            {messages.map((message, index) => (
              <MessageBubble key={index} message={message} usage={message.usage}/>
            ))}
          </div>
            {/* Input Area */}
            <div className="flex gap-4 items-center">
              <div className="flex-1 relative">
                <input 
                  type="text"
                  value={input}
                  onChange={(e) => onInputChange(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && onSend()}
                  className="w-full bg-gray-800 rounded-lg px-4 py-3 pr-12 focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder={modelLoaded ? "Type your message..." : "Please load a model first"}
                  disabled={!modelLoaded}
                />
                <button 
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-500 hover:text-blue-400 p-2"
                  onClick={() => setShowStats(!showStats)}
                >
                  <BarChart2 className="w-5 h-5" />
                </button>
              </div>
              <button 
                className="bg-blue-600 hover:bg-blue-700 p-3 rounded-lg transition-colors"
                onClick={onSend}
                disabled={!modelLoaded}
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>

       {/* Performance Stats Panel */}
       {showStats && (
            <div className="w-1/4 bg-gray-800 rounded-lg p-6 h-fit">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-6 h-6 text-blue-400" />
                  <h2 className="text-xl font-semibold">Performance Stats</h2>
                </div>
                <button 
                  onClick={() => setShowStats(false)}
                  className="text-gray-400 hover:text-gray-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Selected Model */}
              <div className="mb-6 p-3 bg-gray-700/50 rounded-lg">
                <span className="text-sm text-gray-400">Current Model</span>
                <div className="text-white mt-1 font-medium">{selectedModel}</div>
              </div>

              {/* Memory Usage */}
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-400">Memory Usage</span>
                  <span className="text-blue-400 font-medium">
                    {stats.memoryUsage.toFixed(1)} / {stats.maxMemory.toFixed(1)} MB
                  </span>
                </div>
                <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{
                      width: `${(stats.memoryUsage / stats.maxMemory) * 100}%`
                    }}
                  />
                </div>
                <div className="text-right text-xs text-gray-500 mt-1">
                  {((stats.memoryUsage / stats.maxMemory) * 100).toFixed(1)}% used
                </div>
              </div>

              <div className="grid gap-4">
                {/* Core Metrics */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-700/30 p-3 rounded-lg">
                    <div className="text-sm text-gray-400 mb-1">Response Time</div>
                    <div className="text-blue-400 text-lg font-medium">
                      {stats.lastDecodingTime.toFixed(0)} ms
                    </div>
                  </div>
                  <div className="bg-gray-700/30 p-3 rounded-lg">
                    <div className="text-sm text-gray-400 mb-1">Tokens/Second</div>
                    <div className="text-blue-400 text-lg font-medium">
                      {stats.tokensPerSecond.toFixed(1)}
                    </div>
                  </div>
                </div>

                {/* Secondary Metrics */}
                <div className="bg-gray-700/30 p-3 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-400">Peak Memory</span>
                    <span className="text-blue-400 font-medium">{stats.peakMemoryUsage.toFixed(1)} MB</span>
                  </div>
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{
                        width: `${(stats.peakMemoryUsage / stats.maxMemory) * 100}%`
                      }}
                    />
                  </div>
                </div>

                <div className="bg-gray-700/30 p-3 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">Load Time</span>
                    <span className="text-blue-400 font-medium">
                      {(stats.modelLoadTime / 1000).toFixed(1)}s
                    </span>
                  </div>
                </div>
              </div>

              {/* Response Time History */}
              <div className="mt-6">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm text-gray-400">Response Time History</h3>
                  <span className="text-xs text-gray-500">Last {stats.responseHistory.length} requests</span>
                </div>
                <div className="flex items-end h-24 gap-1 bg-gray-700/30 p-2 rounded-lg">
                  {stats.responseHistory.map((time, index) => {
                    const maxTime = Math.max(...stats.responseHistory);
                    const heightPercentage = (time / maxTime) * 100;
                    return (
                      <div
                        key={index}
                        className="flex-1 bg-blue-500 hover:bg-blue-400 transition-all rounded-t relative group"
                        style={{
                          height: `${heightPercentage}%`,
                          minWidth: '4px'
                        }}
                      >
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-xs p-1 rounded absolute -top-6 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                          {time.toFixed(0)}ms
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default EnhancedChatInterface;