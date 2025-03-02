import React, { useState, useRef } from 'react';
import { BarChart2, Send, AlertCircle, X } from 'lucide-react';
import { MessageContent } from './MessageContent';
import browserAILogo from '../assets/browserai-logo.png';

const isSafari = () => {
  const userAgent = navigator.userAgent.toLowerCase();
  return userAgent.includes('safari') && !userAgent.includes('chrome');
};

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
    <div className="min-h-screen bg-black text-white">
      {/* GitHub Banner */}
      <div className="bg-gray-800 py-4 px-4 text-center">
        <p className="text-white flex items-center justify-center gap-2">
          <a 
            href="https://github.com/sauravpanda/browserai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white hover:text-gray-400 font-bold"
          >
            ⭐ Give us a star on GitHub
          </a>
          and help us improve BrowserAI
        </p>
      </div>

      {/* Header Section */}
      <header className="py-1 mt-2">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between items-end mb-10">
            <div className="flex items-center gap-2">
              <p className="text-sm text-gray-400">
                Built with
              </p>
              <a 
                href="https://browserai.dev/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img 
                  src={browserAILogo} 
                  alt="BrowserAI Logo" 
                  className="h-5 w-auto hover:opacity-80 transition-opacity"
                />
              </a>
            </div>
            <div className="flex items-center gap-4">
              {/* Product Hunt Badge */}
              <a href="https://www.producthunt.com/posts/browserai-chat?embed=true&utm_source=badge-featured&utm_medium=badge&utm_souce=badge-browserai&#0045;chat" target="_blank"><img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=878742&theme=dark&t=1739495419803" alt="BrowserAI&#0032;Chat - Chat&#0032;with&#0032;LLMs&#0032;like&#0032;Deepseek&#0032;R1&#0032;locally&#0032;inside&#0032;browser | Product Hunt" style={{ width: '140px', height: '36px' }} width="140" height="36" /></a>
              <a 
                href="https://github.com/Cloud-Code-AI/BrowserAI"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors"
              > 
                <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
              </a>
              <a 
                href="https://discord.gg/GyfX8DfG"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
              </a>
            </div>
          </div>
          
          {isSafari() && (
            <div className="border border-gray-400 rounded-lg px-4 py-8 mb-20 w-full">
              <p className="text-white text-left">
                Please note: BrowserAI is currently not available for Safari
              </p>
            </div>
          )}

          {/* Model Selection & Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <select 
                className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                value={selectedModel}
                onChange={(e) => onModelChange(e.target.value)}
                disabled={loading}
              >
                <option value="smollm2-135m-instruct">SmolLM2 135M Instruct (78MB)</option>
                <option value="smollm2-360m-instruct">SmolLM2 360M Instruct (210MB)</option>
                <option value="smollm2-1.7b-instruct">SmolLM2 1.7B Instruct (1GB)</option>
                <option value="llama-3.2-1b-instruct">Llama 3.2 1B Instruct (712MB)</option>
                <option value="hermes-llama-3.2-3b">Hermes Llama 3.2 3B (1.76GB)</option>
                <option value="llama-3.2-3b-instruct">Llama 3.2 3B Instruct (1.76GB)</option>
                <option value="qwen2.5-0.5b-instruct">Qwen2.5 0.5B Instruct (278MB)</option>
                <option value="qwen2.5-1.5b-instruct">Qwen2.5 1.5B Instruct (868MB)</option>
                <option value="qwen2.5-3b-instruct">Qwen2.5 3B Instruct (1.7GB)</option>
                <option value="gemma-2b-it">Gemma 2B Instruct (1.44GB)</option>
                <option value="phi-3.5-mini-instruct">Phi 3.5 Mini Instruct (2.1GB)</option>
                <option value="tinyllama-1.1b-chat-v0.4">TinyLlama 1.1B Chat (800MB)</option>
                <option value="deepseek-r1-distill-qwen-7b">DeepSeek R1 Distill Qwen 7B (4.18GB)</option>
                <option value="deepseek-r1-distill-llama-8b">DeepSeek R1 Distill Llama 8B (4.41GB)</option>
              </select>
              <button 
                className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg transition-colors"
                onClick={onLoadModel}
                disabled={loading || modelLoaded}
              >
                {loading ? 'Loading...' : modelLoaded ? 'Model Loaded' : 'Load Model'}
              </button>
            </div>
            <p className="text-lg text-gray-400 text-right">
              Download a model to run it locally in your browser. Free and 100% private.
            </p>
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
      <main className="max-w-7xl mx-auto px-4 py-2">
        {/* Current Model Banner */}
        <div className="bg-gray-900 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${modelLoaded ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></div>
              <span className="text-md font-medium">{selectedModel}</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-1 rounded-full bg-gray-800 border border-gray-700 text-sm font-medium text-white">
              <span className={modelLoaded ? 'text-green-400' : 'text-gray-400'}>
                {loading ? 'Loading...' : modelLoaded ? 'Ready' : 'Not Loaded'}
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
          <div className="bg-gray-900 rounded-lg h-[600px] mb-4 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-gray-600" ref={chatBoxRef}>
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
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 pr-12 focus:ring-2 focus:ring-blue-500 outline-none"
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
            <div className="w-1/4 bg-gray-900 rounded-lg p-6 h-fit">
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

      {/* Footer */}
      <footer className="mt-auto py-12 bg-black">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-col items-start gap-2">
              <a 
                href="https://browserai.dev/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img 
                  src={browserAILogo} 
                  alt="BrowserAI Logo" 
                  className="h-6 w-auto hover:opacity-80 transition-opacity"
                />
              </a>
              <span className="text-sm text-gray-400">© 2025 Cloud Code AI. All rights reserved.</span>
            </div>
            <div className="flex items-center gap-12">
              <a 
                href="https://github.com/Cloud-Code-AI/BrowserAI"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors flex items-center gap-2"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                GitHub
              </a>
              <a 
                href="https://discord.gg/GyfX8DfG"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors flex items-center gap-2"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                Join our Discord
              </a>
              <a
                href="https://www.producthunt.com/posts/browserai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 hover:text-white transition-colors flex items-center gap-2"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13.604 8.4h-3.405V12h3.405c.995 0 1.801-.806 1.801-1.801 0-.995-.806-1.799-1.801-1.799zM12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zm1.604 14.4h-3.405V18H7.801V6h5.803c2.207 0 4.001 1.794 4.001 4.001 0 2.205-1.794 3.999-4.001 3.999z"/>
                </svg>
                Product Hunt
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default EnhancedChatInterface;