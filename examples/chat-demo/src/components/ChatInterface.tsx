import { useState, useEffect, useRef } from 'react';
import styled from '@emotion/styled';
import { BrowserAI } from '@browserai/browserai';
import posthog from 'posthog-js';
import { MessageContent } from './MessageContent';
import React from 'react';

//added my manmohan

const MessageContainer = styled.div<{ isUser: boolean }>`
  background: ${props => props.isUser ? '#3b82f6' : '#404040'};
  color: ${props => props.isUser ? '#ffffff' : '#ffffff'};
  padding: 12px 16px;
  border-radius: 8px;
  margin: 12px 0;
  max-width: 80%;
  margin-left: ${props => props.isUser ? 'auto' : '0'};
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
`;

const Message: React.FC<{ text: string; isUser: boolean }> = ({ text, isUser }) => {
  return (
    <MessageContainer isUser={isUser}>
      <MessageContent content={text} />
    </MessageContainer>
  );
};
//added my manmohan
const Description = styled.div`
  text-align: center;
  margin-bottom: 32px;
  color: #a0a0a0;
  
  a {
    color: #3b82f6;
    text-decoration: none;
    &:hover {
      text-decoration: underline;
    }
  }
`;

const Header = styled.div`
  margin-bottom: 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;

  h1 {
    margin: 0;
    font-size: 32px;
    font-weight: 600;
  }
`;

const ModelSelect = styled.select`
  padding: 8px 12px;
  border: 1px solid #404040;
  border-radius: 4px;
  background: #2d2d2d;
  color: #ffffff;
  font-size: 14px;
  min-width: 200px;
  cursor: pointer;
  
  &:hover {
    border-color: #4a5568;
  }
  
  &:focus {
    outline: none;
    border-color: #3b82f6;
  }
`;

const ChatBox = styled.div`
  border: 1px solid #404040;
  border-radius: 8px;
  height: 500px;
  overflow-y: auto;
  padding: 24px;
  margin-bottom: 20px;
  background: #2d2d2d;
`;


const InputContainer = styled.div`
  display: flex;
  gap: 12px;
  padding: 16px;
  background: #2d2d2d;
  border: 1px solid #404040;
  border-radius: 8px;
`;

const Input = styled.input`
  flex: 1;
  padding: 12px;
  border: 1px solid #404040;
  border-radius: 4px;
  font-size: 14px;
  background: #1a1a1a;
  color: #ffffff;
  
  &:focus {
    outline: none;
    border-color: #3b82f6;
  }
`;

const Button = styled.button`
  padding: 8px 16px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  
  &:hover {
    background: #2563eb;
  }
  
  &:disabled {
    background: #404040;
    cursor: not-allowed;
  }
`;

const TestWorkerButton = styled(Button)`
  font-size: 12px;
  padding: 4px 8px;
`;

const Spinner = styled.div`
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  margin: 20px auto;
  animation: spin 1s linear infinite;

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

const LoadingIndicator = styled.div`
  text-align: center;
  color: #666;
  padding: 40px;
`;

const Layout = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 20px;
  min-height: 100vh;
`;

const MainContent = styled.div`
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 24px;
  align-items: start;
`;

const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  
  .chat-main {
    flex: 1;
    overflow-y: auto;
    scroll-behavior: smooth;
    padding: 1rem;
    
    .messages-container {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
  }
`;

const Sidebar = styled.div`
  background: #2d2d2d;
  border-radius: 8px;
  padding: 20px;
  border: 1px solid #404040;
  height: fit-content;
  position: sticky;
  top: 20px;
`;

const ModelStatus = styled.div`
  text-align: center;
  padding: 12px;
  background: #2d2d2d;
  border-radius: 8px;
  margin-bottom: 20px;
  border: 1px solid #404040;
  color: #a0a0a0;
`;

const StatItem = styled.div`
  margin-bottom: 16px;
  
  h3 {
    font-size: 14px;
    color: #a0a0a0;
    margin: 0 0 8px 0;
  }
  
  .value {
    font-size: 24px;
    font-weight: 500;
    color: #3b82f6;
  }
  
  .unit {
    font-size: 12px;
    color: #666;
    margin-left: 4px;
  }
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 4px;
  background: #404040;
  border-radius: 2px;
  margin-top: 8px;
  overflow: hidden;
  
  .fill {
    height: 100%;
    background: #3b82f6;
    transition: width 0.3s ease;
  }
`;

const StatusIndicator = styled.div<{ isLoaded: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 16px;
  font-size: 13px;
  background: ${props => props.isLoaded ? '#1a392c' : '#2d2d2d'};
  color: ${props => props.isLoaded ? '#4ade80' : '#a0a0a0'};
  border: 1px solid ${props => props.isLoaded ? '#22543d' : '#404040'};

  &::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${props => props.isLoaded ? '#4ade80' : '#a0a0a0'};
  }
`;

const PrivacyBanner = styled.div`
  background: #1a1a1a;
  border: 1px solid #404040;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 24px;
  
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    gap: 8px;
  }
  
  .details {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #404040;
    color: #a0a0a0;
    font-size: 14px;
  }
  
  a {
    color: #3b82f6;
    text-decoration: none;
    &:hover {
      text-decoration: underline;
    }
  }
`;

const ErrorMessage = styled.div`
  color: #ef4444;
  background: #451a1a;
  border: 1px solid #dc2626;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
`;

const ThinkingDropdown = styled.div<{ isOpen: boolean }>`
  margin-bottom: 1rem;
  border: 1px solid #404040;
  border-radius: 4px;
  overflow: hidden;
  background: #1a1a1a;

  .thinking-header {
    padding: 8px 12px;
    background: #2d2d2d;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    user-select: none;
    font-size: 14px;
    color: #a0a0a0;
    
    &:hover {
      background: #363636;
    }

    .icon {
      font-size: 12px;
      transition: transform 0.2s;
      transform: ${props => props.isOpen ? 'rotate(180deg)' : 'rotate(0deg)'};
    }
  }

  .thinking-content {
    padding: 12px;
    color: #a0a0a0;
    font-size: 14px;
    line-height: 1.5;
    border-top: 1px solid #404040;
  }
`;

const WorkerStatus = styled.div<{ active: boolean }>`
  position: fixed;
  bottom: 20px;
  right: 20px;
  padding: 8px 12px;
  border-radius: 4px;
  background: ${props => props.active ? '#1a392c' : '#2d2d2d'};
  color: ${props => props.active ? '#4ade80' : '#a0a0a0'};
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  
  &::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${props => props.active ? '#4ade80' : '#a0a0a0'};
  }
`;

interface ChatInterfaceProps {
  children?: (props: {
    stats: {
      memoryUsage: number;
      maxMemory: number;
      lastDecodingTime: number;
      lastEncodingTime: number;
      tokensPerSecond: number;
      modelSize: number;
      peakMemoryUsage: number;
      responseHistory: number[];
      modelLoadTime: number;
      contextWindowUsed: number;
    };
    messages: Array<{ text: string; isUser: boolean }>;
    input: string;
    modelLoaded: boolean;
    selectedModel: string;
    loading: boolean;
    loadingProgress: number;
    loadingStats: {
      progress: number;
      estimatedTimeRemaining: number | null;
    };
    showPrivacyBanner: boolean;
    onSend: () => void;
    onInputChange: (value: string) => void;
    onModelChange: (model: string) => void;
    onLoadModel: () => void;
  }) => React.ReactNode;
}

interface LoadingStats {
  startTime: number;
  progress: number;
  estimatedTimeRemaining: number | null;
}

export default function ChatInterface({ children }: ChatInterfaceProps) {
  const [browserAI] = useState(() => new BrowserAI());
  const [selectedModel, setSelectedModel] = useState('smollm2-135m-instruct');
  const [useWebWorker, setUseWebWorker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Array<{ text: string; isUser: boolean }>>([]);
  const [input, setInput] = useState('');
  const [modelLoaded, setModelLoaded] = useState(false);
  const [stats, setStats] = useState({
    memoryUsage: 0,
    maxMemory: 0,
    lastDecodingTime: 0,
    lastEncodingTime: 0,
    tokensPerSecond: 0,
    modelSize: 0,
    peakMemoryUsage: 0,
    responseHistory: [] as number[],
    modelLoadTime: 0,
    contextWindowUsed: 0,
  });
  const [showPrivacyBanner, ] = useState(true);
  const [showPrivacyDetails, setShowPrivacyDetails] = useState(false);
  const chatBoxRef = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStats, setLoadingStats] = useState<LoadingStats>({
    startTime: 0,
    progress: 0,
    estimatedTimeRemaining: null
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

    // Get WebGL information
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const webGLInfo = gl ? {
      vendor: gl.getParameter(gl.VENDOR),
      renderer: gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxRenderBufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      hasWebGL2: !!canvas.getContext('webgl2'),
    } : null;


  const loadModel = async () => {
    console.log(`[BrowserAI] Starting to load model with worker: ${useWebWorker}`);
    
    // Add performance markers
    performance.mark('modelLoadStart');
    
    setLoading(true);
    setLoadError(null);
    const startTime = performance.now();
    const memoryBefore = (performance as any).memory?.usedJSHeapSize;
    setLoadingProgress(0);
    setLoadingStats({
      startTime,
      progress: 0,
      estimatedTimeRemaining: null
    });

    try {
      await browserAI.loadModel(selectedModel, {
        useWorker: useWebWorker,
        onProgress: (progress: any) => {
          console.log(`[${useWebWorker ? 'Worker' : 'Main'}] Progress:`, progress);
          const currentTime = performance.now();
          const elapsedTime = (currentTime - startTime) / 1000; // in seconds
          const progressPercent = progress.progress;
          const text = progress.text;
          console.log(`[BrowserAI] Loading progress:`, progressPercent);
          // Calculate estimated time remaining
          let estimatedTimeRemaining = 0;
          if (progressPercent > 0) {
            const timePerPercent = elapsedTime / (progressPercent * 100);
            estimatedTimeRemaining = timePerPercent * (100 - progressPercent*100);
            setLoadingProgress(progressPercent * 100);
            setLoadingStats({
              startTime,
              progress: progressPercent,
              estimatedTimeRemaining
            });
          } else {
            if (text.includes('Loading model from cache')) {
              const match = text.match(/Loading model from cache\[(\d+)\/(\d+)\]/);
              if (match) {
                const currentShard = parseInt(match[1], 10);
                const totalShards = parseInt(match[2], 10);
                const loadingProgress = currentShard / totalShards;
                
                // Calculate estimated time remaining
                const timePerShard = elapsedTime / currentShard;
                const remainingShards = totalShards - currentShard;
                estimatedTimeRemaining = timePerShard * remainingShards;
                
                // Update progress based on shard loading
                setLoadingProgress(loadingProgress * 100);
                setLoadingStats({
                  startTime,
                  progress: loadingProgress,
                  estimatedTimeRemaining
                });
                
              }
            }
          }
        }
      });
      
      const loadTime = performance.now() - startTime;
      console.log(`[BrowserAI] Model loaded successfully in ${loadTime.toFixed(0)}ms using ${useWebWorker ? 'Web Worker' : 'Main Thread'}`);
      const memoryAfter = (performance as any).memory?.usedJSHeapSize;
      const memoryIncrease = memoryAfter - memoryBefore;

      setStats(prev => ({
        ...prev,
        modelLoadTime: loadTime,
      }));
      setModelLoaded(true);
    } catch (err) {
      const error = err as Error;
      console.error('[BrowserAI] Error loading model:', {
        model: selectedModel,
        error: error.message,
        stack: error.stack
      });
      setLoadError(error.message);
      setModelLoaded(false);
    }
    setLoading(false);
    setLoadingProgress(0);
    setLoadingStats({
      startTime: 0,
      progress: 0,
      estimatedTimeRemaining: null
    });
    
    performance.mark('modelLoadEnd');
    performance.measure('Model Load Time', 'modelLoadStart', 'modelLoadEnd');
  };

  const handleModelChange = (newModel: string) => {
    setSelectedModel(newModel);
    setModelLoaded(false);
  };

  const handleSend = async () => {
    if (!input.trim() || !modelLoaded) return;

    console.log(`[BrowserAI] Starting generation using ${
      useWebWorker ? 'Web Worker' : 'Main Thread'
    }`);
    
    performance.mark('generationStart');
    
    console.log(`[BrowserAI] Starting text generation with input length: ${input.length}`);
    const userMessage = { text: input, isUser: true };
    setMessages(prev => [...prev, userMessage]);
    setInput('');

    try {
      const startTime = performance.now();
      const chunks = await browserAI.generateText(input, {
        max_tokens: 4096,
        temperature: 0.6,
        frequency_penalty: 0.5,
        presence_penalty: 0.5,
        stream: true,
      });

      let response = '';
      let chunkCount = 0;
      for await (const chunk of chunks as AsyncIterable<{
        choices: Array<{ delta: { content?: string } }>,
        usage: any
      }>) {
        chunkCount++;
        const newContent = chunk.choices[0]?.delta.content || '';
        const newUsage = chunk.usage;
        response += newContent;
        setMessages(prevMessages => {
          if (prevMessages[prevMessages.length - 1]?.isUser) {
            return [...prevMessages, { text: response, isUser: false }];
          } else {
            const updatedMessages = [...prevMessages];
            updatedMessages[updatedMessages.length - 1].text = response;
            return updatedMessages;
          }
        });
      }
      const responseTime = performance.now() - startTime;
      console.log('[BrowserAI] Text generation completed:', {
        responseTimeMs: responseTime.toFixed(0),
        outputLength: response.length,
        chunks: chunkCount
      });

      setStats(prev => {
        const newResponseHistory = [...prev.responseHistory, responseTime].slice(-10);
        const avgResponse = newResponseHistory.reduce((a, b) => a + b, 0) / newResponseHistory.length;
        
        return {
          ...prev,
          lastDecodingTime: responseTime,
          tokensPerSecond: response.length / (4* responseTime / 1000),
          averageResponseTime: avgResponse,
          responseHistory: newResponseHistory,
          peakMemoryUsage: Math.max(prev.peakMemoryUsage, prev.memoryUsage)
        };
      });

      performance.mark('generationEnd');
      performance.measure('Generation Time', 'generationStart', 'generationEnd');
      
      console.log(`[BrowserAI] Generation completed in ${
        performance.getEntriesByName('Generation Time')[0].duration.toFixed(0)
      }ms using ${useWebWorker ? 'Web Worker' : 'Main Thread'}`);

    } catch (err) {
      const error = err as Error;
      console.error('[BrowserAI] Error generating text:', {
        model: selectedModel,
        error: error.message,
        stack: error.stack
      });
      posthog.capture('message_error', {
        model: selectedModel,
        error: error.message
      });
      console.error('Error generating response:', error);
      const errorMessage = { text: 'Error generating response', isUser: false };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  useEffect(() => {
    const updateMemoryUsage = async () => {
      if ('performance' in window && 'memory' in performance) {
        const memory = (performance as any).memory as {
          usedJSHeapSize: number;
          totalJSHeapSize: number;
          jsHeapSizeLimit: number;
        };
        setStats(prev => ({
          ...prev,
          memoryUsage: memory.usedJSHeapSize / (1024 * 1024),
          maxMemory: memory.jsHeapSizeLimit / (1024 * 1024),
        }));
      }
    };

    const interval = setInterval(updateMemoryUsage, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {

    const rafCallback = () => {
      requestAnimationFrame(rafCallback);
    };

    requestAnimationFrame(rafCallback);

    return () => {
      // Cleanup if needed
    };
  }, []);

  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Scroll on new messages or content updates
  useEffect(() => {
    scrollToBottom();
  }, [messages]); // Scroll when messages array changes

  return children ? children({
    stats,
    messages,
    input,
    modelLoaded,
    selectedModel,
    loading,
    loadingProgress,
    loadingStats: {
      progress: loadingProgress,
      estimatedTimeRemaining: loadingStats.estimatedTimeRemaining
    },
    showPrivacyBanner,
    onSend: handleSend,
    onInputChange: (value) => setInput(value),
    onModelChange: handleModelChange,
    onLoadModel: loadModel
  }) : (
    <Layout>
      <Header>
        <h1>BrowserAI Chat Demo</h1>
        <Description>
          A simple chat interface built using{' '}
          <a href="https://github.com/sauravpanda/browserai" target="_blank" rel="noopener noreferrer">
            BrowserAI
          </a>
          {' '}- Run AI models directly in your browser!
        </Description>
        <div style={{ 
          display: 'flex', 
          gap: '16px', 
          alignItems: 'center',
          flexWrap: 'wrap',
          justifyContent: 'center' 
        }}>
          <ModelSelect 
            value={selectedModel} 
            onChange={e => handleModelChange(e.target.value)}
            disabled={loading}
          >
            <option value="smollm2-135m-instruct">SmolLM2 135Mdd Instruct (360MB)</option>
            <option value="smollm2-360m-instruct">SmolLM2 360M Instruct (380MB)</option>
            <option value="smollm2-1.7b-instruct">SmolLM2 1.7B Instruct (1,75GB)</option>
            <option value="llama-3.2-1b-instruct">Llama 3.2 1B Instruct (880MB)</option>
            <option value="phi-3.5-mini-instruct">Phi 3.5 Mini Instruct (3.6GB)</option>
            <option value="qwen2.5-0.5b-instruct">Qwen2.5 0.5B Instruct (950MB)</option>
            <option value="qwen2.5-1.5b-instruct">Qwen2.5 1.5B Instruct (1.6GB)</option>
            <option value="gemma-2b-it">Gemma 2B Instruct (1.4GB)</option>
            <option value="tinyllama-1.1b-chat-v0.4">TinyLlama 1.1B Chat (670MB)</option>
          </ModelSelect>
          
          <div style={{ 
            display: 'flex', 
            alignItems: 'center',
            gap: '8px'
          }}>
            <input
              type="checkbox"
              id="worker-toggle"
              checked={useWebWorker}
              onChange={e => setUseWebWorker(e.target.checked)}
              disabled={loading || modelLoaded}
            />
            <label 
              htmlFor="worker-toggle" 
              style={{ color: '#a0a0a0', fontSize: '14px' }}
            >
              Use Web Worker
            </label>
          </div>

          <TestWorkerButton
            onClick={async () => {
              if (!modelLoaded) return;
              
              // Start a UI-blocking operation
              const startTime = performance.now();
              
              // Generate text while also updating UI
              let dots = '';
              const updateInterval = setInterval(() => {
                dots = dots.length >= 3 ? '' : dots + '.';
                setInput(`Testing worker${dots}`);
              }, 100);
              
              try {
                await browserAI.generateText('Generate a long story about a cat.');
                clearInterval(updateInterval);
                setInput(`Test completed in ${(performance.now() - startTime).toFixed(0)}ms`);
              } catch (err) {
                clearInterval(updateInterval);
                setInput('Test failed');
              }
            }}
            disabled={!modelLoaded}
          >
            Test Worker
          </TestWorkerButton>

          <Button 
            onClick={loadModel}
            disabled={loading || modelLoaded}
          >
            {loading ? 'Loading...' : modelLoaded ? 'Model Loaded' : 'Load Model'}
          </Button>
          <StatusIndicator isLoaded={modelLoaded}>
            {modelLoaded ? 'Model Ready' : 'Model Not Loaded'}
          </StatusIndicator>
        </div>
      </Header>

      {loadError && (
        <ErrorMessage>
          Failed to load model: {loadError}
        </ErrorMessage>
      )}

      {showPrivacyBanner && (
        <PrivacyBanner>
          <div className="header" onClick={() => setShowPrivacyDetails(!showPrivacyDetails)}>
            <span style={{ color: '#a0a0a0' }}>
              📊 We collect anonymous performance metrics
              {!showPrivacyDetails && ' (click to learn more)'}
            </span>
            <span style={{ color: '#666' }}>
              {showPrivacyDetails ? '▼' : '▶'}
            </span>
          </div>
          {showPrivacyDetails && (
            <div className="details">
              We collect performance metrics and metadata to improve our library. 
              We don't store any conversation data - only technical metrics like response times, 
              memory usage, and error rates. {' '}
              <a href="https://github.com/browser-ai/browserai" target="_blank" rel="noopener noreferrer">
                Learn more
              </a>
            </div>
          )}
        </PrivacyBanner>
      )}

      <MainContent>
        <ChatContainer>
          <ModelStatus>
            {modelLoaded ? `Current Model: ${selectedModel}` : 'No Model Loaded'}
          </ModelStatus>
          
          {loading ? (
            <LoadingIndicator>
              <Spinner />
              <div style={{ marginBottom: '16px' }}>Loading model...</div>
              <ProgressBar>
                <div 
                  className="fill" 
                  style={{ width: `${loadingProgress}%` }} 
                />
              </ProgressBar>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                marginTop: '8px',
                fontSize: '14px',
                color: '#a0a0a0'
              }}>
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
              <div style={{ 
                marginTop: '12px',
                fontSize: '13px',
                color: '#666'
              }}>
                {selectedModel.includes('instruct') && 
                  "This model includes instruction tuning for better chat responses"}
              </div>
            </LoadingIndicator>
          ) : (
            <>
              <ChatBox ref={chatBoxRef}>
                {messages.map((message, index) => (
                  <Message key={index} text={message.text} isUser={message.isUser} />
                ))}
                <div ref={messagesEndRef} />
              </ChatBox>
              <InputContainer>
                <Input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && handleSend()}
                  placeholder={modelLoaded ? 'Type your message...' : 'Please load a model first'}
                  disabled={!modelLoaded}
                />
                <Button 
                  onClick={handleSend}
                  disabled={!modelLoaded}
                >
                  Send
                </Button>
              </InputContainer>
            </>
          )}
        </ChatContainer>

        <Sidebar>
          <h2 style={{ marginTop: '0px', marginBottom: '24px' }}>Performance Stats</h2>
          
          <StatItem>
            <h3>Memory Usage</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>
                <span className="value">{stats.memoryUsage.toFixed(1)}</span>
                <span className="unit">MB</span>
              </span>
              <span style={{ color: '#666' }}>
                of {stats.maxMemory.toFixed(1)} MB
              </span>
            </div>
            <ProgressBar>
              <div 
                className="fill" 
                style={{ width: `${(stats.memoryUsage / stats.maxMemory * 100).toFixed(1)}%` }} 
              />
            </ProgressBar>
          </StatItem>
          
          <StatItem>
            <h3>Last Response Time</h3>
            <span className="value">{stats.lastDecodingTime.toFixed(0)}</span>
            <span className="unit">ms</span>
          </StatItem>
          
          <StatItem>
            <h3>Tokens per Second</h3>
            <span className="value">{stats.tokensPerSecond.toFixed(1)}</span>
            <span className="unit">tokens/s</span>
          </StatItem>
          
          <StatItem>
            <h3>Selected Model</h3>
            <div style={{ color: '#fff', fontSize: '14px' }}>{selectedModel}</div>
          </StatItem>

          <StatItem>
            <h3>Model Load Time</h3>
            <span className="value">{(stats.modelLoadTime / 1000).toFixed(1)}</span>
            <span className="unit">s</span>
          </StatItem>
          
          <StatItem>
            <h3>Peak Memory Usage</h3>
            <span className="value">{stats.peakMemoryUsage.toFixed(1)}</span>
            <span className="unit">MB</span>
            <ProgressBar>
              <div 
                className="fill" 
                style={{ width: `${Math.min(stats.peakMemoryUsage / 1000 * 100, 100)}%` }} 
              />
            </ProgressBar>
          </StatItem>

          <StatItem>
            <h3>Response Time History</h3>
            <div style={{ 
              display: 'flex', 
              gap: '2px', 
              height: '40px', 
              alignItems: 'flex-end'
            }}>
              {stats.responseHistory.map((time, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    background: '#3b82f6',
                    height: `${Math.min((time / 5000) * 100, 100)}%`,
                    borderRadius: '2px',
                  }}
                />
              ))}
            </div>
          </StatItem>

          <StatItem>
            <h3>Processing Mode</h3>
            <div style={{ color: '#fff', fontSize: '14px' }}>
              {useWebWorker ? 'Web Worker (Background Thread)' : 'Main Thread'}
            </div>
          </StatItem>

        </Sidebar>
      </MainContent>

      <WorkerStatus active={useWebWorker && modelLoaded}>
        {useWebWorker ? 'Web Worker Active' : 'Main Thread'}
      </WorkerStatus>
    </Layout>
  );
}