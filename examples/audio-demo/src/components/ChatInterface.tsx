import { useState, useEffect } from 'react';
import styled from '@emotion/styled';
import { BrowserAI } from '@browserai/browserai';
import posthog from 'posthog-js';

const Container = styled.div`
  width: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: #1a1a1a;
  color: #ffffff;
`;

const MainContent = styled.div`
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const ContentLayout = styled.div`
  width: 100%;
  display: flex;
  gap: 32px;
  justify-content: center;
  margin-top: 12px;
  align-items: flex-start;
  max-width: 1400px;
  margin-left: auto;
  margin-right: auto;
  padding: 0 24px;
`;

const ChatContainer = styled.div`
  flex: 1;
  max-width: 800px;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 0;
`;

const Title = styled.h1`
  color: #ffffff;
  text-align: center;
  margin-bottom: 30px;
  font-size: 2.5rem;
  font-weight: 600;
  background: linear-gradient(120deg, #4CAF50, #2196F3);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 2px 4px rgba(0,0,0,0.1);
`;

const ChatBox = styled.div`
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  height: 600px;
  width: 100%;
  overflow-y: auto;
  padding: 20px;
  margin-bottom: 20px;
  background: rgba(42, 42, 42, 0.7);
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
  }

  /* Scrollbar styling */
  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: #1a1a1a;
  }

  &::-webkit-scrollbar-thumb {
    background: #444;
    border-radius: 4px;
  }
`;

const Message = styled.div<{ isUser: boolean }>`
  background: ${props => props.isUser ?
    'linear-gradient(135deg, #4CAF50, #45a049)' :
    'linear-gradient(135deg, #333, #2a2a2a)'};
  padding: 16px 24px;
  border-radius: 20px;
  margin: 12px 0;
  max-width: 90%;
  text-align: left;
  font-size: 1.2rem;
  line-height: 1.5;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: scale(0);
  animation: popIn 0.3s ease-out forwards;
  border: 1px solid rgba(255, 255, 255, 0.1);

  @keyframes popIn {
    0% { transform: scale(0); opacity: 0; }
    70% { transform: scale(1.05); opacity: 0.7; }
    100% { transform: scale(1); opacity: 1; }
  }
`;

const ActionButton = styled.button<{ isRecording?: boolean; isLoading?: boolean }>`
  background: ${props => {
    if (props.isLoading) return 'linear-gradient(135deg, #666, #555)';
    return props.isRecording ?
      'linear-gradient(135deg, #ff4444, #cc0000)' :
      'linear-gradient(135deg, #4CAF50, #45a049)';
  }};
  color: white;
  padding: 14px 28px;
  border-radius: 30px;
  border: none;
  cursor: ${props => props.isLoading ? 'wait' : 'pointer'};
  transition: all 0.3s ease;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  position: relative;
  overflow: hidden;
  font-size: 1rem;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);

  &:hover {
    opacity: ${props => props.isLoading ? 1 : 0.9};
    transform: ${props => props.isLoading ? 'none' : 'translateY(-2px)'};
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
  }

  ${props => props.isLoading && `
    &:after {
      content: '';
      position: absolute;
      left: -100%;
      top: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(
        90deg,
        transparent,
        rgba(255, 255, 255, 0.2),
        transparent
      );
      animation: loading 1.5s infinite;
    }
  `}

  @keyframes loading {
    100% {
      left: 100%;
    }
  }
`;

const AudioControls = styled.div`
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-bottom: 20px;
`;

const Spinner = styled.div`
  width: 40px;
  height: 40px;
  border: 4px solid #333;
  border-top: 4px solid #4CAF50;
  border-radius: 50%;
  margin: 20px auto;
  animation: spin 1s linear infinite;

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

const RecordingIndicator = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  width: 100%;
  height: 100%;
`;

const WaveContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  height: 60px;
`;

const WaveBar = styled.div`
  width: 8px;
  height: 20px;
  background: #4CAF50;
  border-radius: 4px;
  animation: wave 1s ease-in-out infinite;

  @keyframes wave {
    0%, 100% { height: 20px; }
    50% { height: 60px; }
  }

  &:nth-of-type(2) { animation-delay: 0.1s; }
  &:nth-of-type(3) { animation-delay: 0.2s; }
  &:nth-of-type(4) { animation-delay: 0.3s; }
  &:nth-of-type(5) { animation-delay: 0.4s; }
`;

const RecordingText = styled.div`
  font-size: 1.2rem;
  color: #4CAF50;
  animation: pulse 1.5s ease-in-out infinite;

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`;

const InfoSection = styled.div`
  background: rgba(76, 175, 80, 0.05);
  border: 1px solid rgba(76, 175, 80, 0.2);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 30px;
  text-align: center;
  max-width: 600px;
  width: 100%;
  backdrop-filter: blur(5px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 25px rgba(0, 0, 0, 0.15);
  }
`;

const InfoText = styled.p`
  color: #9e9e9e;
  font-size: 0.95rem;
  line-height: 1.5;
  margin: 0;
`;

const ModelBadge = styled.span`
  background: linear-gradient(135deg, rgba(76, 175, 80, 0.2), rgba(33, 150, 243, 0.2));
  color: #4CAF50;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.9rem;
  margin: 0 4px;
  border: 1px solid rgba(76, 175, 80, 0.3);
  font-weight: 500;
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(76, 175, 80, 0.2);
  }
`;

const Sidebar = styled.div`
  width: 340px;
  background: rgba(45, 45, 45, 0.7);
  border-radius: 16px;
  padding: 28px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  height: fit-content;
  position: sticky;
  top: 20px;
  margin-top: 64px;
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
  }

  h2 {
    margin-top: 0;
    margin-bottom: 32px;
    font-size: 1.8rem;
    background: linear-gradient(120deg, #4CAF50, #2196F3);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
`;

const StatItem = styled.div`
  margin-bottom: 24px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  
  h3 {
    font-size: 16px;
    color: #a0a0a0;
    margin: 0 0 16px 0;
    font-weight: 500;
  }
  
  .value {
    font-size: 24px;
    font-weight: 500;
    color: #4CAF50;
  }
  
  .unit {
    font-size: 14px;
    color: #888;
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
    background: #4CAF50;
    transition: width 0.3s ease;
  }
`;

const ProcessingMetric = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  
  &:last-child {
    border-bottom: none;
  }
  
  .label {
    color: #a0a0a0;
    font-size: 14px;
  }
  
  .value {
    color: #4CAF50;
    font-weight: 500;
    font-size: 16px;
  }
`;

const MessageWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
`;

const SpeakButton = styled.button<{ isLoading?: boolean }>`
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  opacity: ${props => props.isLoading ? 0.7 : 1};
  
  &:hover {
    background: rgba(255, 255, 255, 0.1);
    transform: ${props => props.isLoading ? 'none' : 'scale(1.1)'};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  font-size: 1.2rem;
`;

const ModelSelect = styled.select`
  background: rgba(45, 45, 45, 0.7);
  color: white;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  margin-right: 10px;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: #4CAF50;
  }
`;

const LoadButton = styled(ActionButton)`
  padding: 10px 20px;
  font-size: 0.9rem;
`;

type Message = {
  text: string;
  isUser: boolean;
};

const captureAnalytics = (eventName: string, properties?: Record<string, any>) => {
  try {
    if (typeof posthog !== 'undefined') {
      posthog.capture(eventName, properties);
    }
  } catch (error) {
    // Silently fail if PostHog is blocked or unavailable
    console.debug('Analytics disabled or blocked');
  }
};

const initPostHog = () => {
  // Only run in browser environment
  if (typeof window === 'undefined') return;

  try {
    if (typeof posthog !== 'undefined') {
      // Wait for next tick to ensure document is ready
      setTimeout(() => {
        posthog.init('phc_zZuhhgvhx49iRC6ftmFcnVKZrlraLCyPeFbs5mWzmxp', {
          api_host: 'https://us.i.posthog.com',
          person_profiles: 'identified_only',
          loaded: (posthog) => {
            posthog.debug(false);
          }
        });
      }, 0);
    }
  } catch (error) {
    console.debug('Analytics initialization failed');
  }
};

export default function ChatInterface() {
  const [status, setStatus] = useState('Initializing...');
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [audioProcessingTime, setAudioProcessingTime] = useState<number>(0);
  const [chatProcessingTime, setChatProcessingTime] = useState<number>(0);
  const [voiceProcessingTime, setVoiceProcessingTime] = useState<number>(0);
  const [speakingMessageId, setSpeakingMessageId] = useState<number | null>(null);
  const [actionType, setActionType] = useState<string>('Loading');
  const [audioAIRef] = useState(new BrowserAI());
  const [chatAIRef] = useState(new BrowserAI());
  const [ttsAIRef] = useState(new BrowserAI());
  const [stats, setStats] = useState({
    memoryUsage: 0,
    maxMemory: 0,
    lastProcessingTime: 0,
    tokensPerSecond: 0,
    modelLoadTime: 0,
    peakMemoryUsage: 0,
    responseHistory: [] as number[],
  });

  const [selectedModel, setSelectedModel] = useState('smollm2-135m-instruct');
  const [isModelLoaded, setIsModelLoaded] = useState(false);

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
    // Only run in browser environment
    if (typeof window === 'undefined') return;

    // Initialize PostHog
    initPostHog();

    // Capture page view after a small delay
    const pageViewTimeout = setTimeout(() => {
      captureAnalytics('voice_chat_page_view', {
        userAgent: navigator?.userAgent,
        platform: navigator?.platform,
        screenResolution: window?.screen ? `${window.screen.width}x${window.screen.height}` : undefined,
        pixelRatio: window?.devicePixelRatio,
        language: navigator?.language,
        hardwareConcurrency: navigator?.hardwareConcurrency,
        deviceMemory: (navigator as any)?.deviceMemory,
        maxTouchPoints: navigator?.maxTouchPoints,
        hasPerformanceAPI: 'performance' in window,
        hasMemoryInfo: 'performance' in window && 'memory' in performance,
        hasWebWorker: 'Worker' in window,
        hasWebAssembly: typeof WebAssembly === 'object',
        hasSIMD: 'Atomics' in window && 'SharedArrayBuffer' in window,
      });
    }, 100);

    return () => {
      clearTimeout(pageViewTimeout);
    };
  }, []);

  const startRecording = async () => {
    try {
      setActionType('Processing');
      setAudioProcessingTime(0);
      setChatProcessingTime(0);
      setVoiceProcessingTime(0);
      setIsRecording(true);
      setStatus('Recording...');
      setMessages([]);
      await audioAIRef.startRecording();

      captureAnalytics('start_recording', {
        memoryUsage: stats.memoryUsage,
        peakMemoryUsage: stats.peakMemoryUsage,
      });
    } catch (error) {
      console.error('Recording error:', error);
      captureAnalytics('recording_error', {
        error: (error as Error).message,
        memoryUsage: stats.memoryUsage,
      });
      setStatus('Error recording');
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    try {
      setStatus('Processing...');
      const startTime = performance.now();
      const audioBlob = await audioAIRef.stopRecording();
      setIsRecording(false);

      if (audioBlob) {
        const audioStartTime = performance.now();
        const transcription = await audioAIRef.transcribeAudio(audioBlob);
        const audioEndTime = performance.now();
        const audioProcessingTime = audioEndTime - audioStartTime;
        setAudioProcessingTime(audioProcessingTime);

        captureAnalytics('audio_processed', {
          duration: audioProcessingTime,
          blobSize: audioBlob.size,
          memoryUsage: stats.memoryUsage,
          processingTimeMs: audioProcessingTime,
        });

        const transcribedText = (transcription as { text: string })?.text;
        if (transcribedText) {
          setMessages(prev => [...prev, { text: transcribedText, isUser: true }]);

          try {
            const chatStartTime = performance.now();
            const response = await chatAIRef.generateText(transcribedText, {
              max_tokens: 300,
              temperature: 0.7,
              system_prompt: 'You are a helpful assistant who answers questions about the user\'s input in short and concise manner. Keep answer to 3-5 sentences. '
            });
            const chatEndTime = performance.now();
            const chatProcessingTime = chatEndTime - chatStartTime;
            setChatProcessingTime(chatProcessingTime);

            captureAnalytics('chat_response_generated', {
              inputLength: transcribedText?.length,
              responseLength: (response as { choices: { message: { content: string } }[] }).choices[0]?.message?.content?.length,
              processingTimeMs: chatProcessingTime,
              memoryUsage: stats.memoryUsage,
              peakMemoryUsage: stats.peakMemoryUsage,
            });

            const responseText = (response as { choices: { message: { content: string } }[] }).choices[0]?.message?.content || 'No response';
            setMessages(prev => [...prev, { text: responseText, isUser: false }]);
          } catch (error) {
            console.error('Error generating response:', error);
            setMessages(prev => [...prev, { text: 'Error generating response', isUser: false }]);
          }
        }

        const endTime = performance.now();
        const totalProcessingTime = endTime - startTime;

        captureAnalytics('interaction_complete', {
          totalDurationMs: totalProcessingTime,
          audioProcessingMs: audioProcessingTime,
          chatProcessingMs: chatProcessingTime,
          memoryUsage: stats.memoryUsage,
          peakMemoryUsage: stats.peakMemoryUsage,
          responseHistoryLength: stats.responseHistory.length,
        });
      }
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error('Processing error:', error);
      captureAnalytics('processing_error', {
        error: errorMessage,
        memoryUsage: stats.memoryUsage,
        state: status,
      });
      setStatus('Error processing');
    } finally {
      setIsRecording(false);
      setStatus('Ready');
    }
  };

  const speakMessage = async (text: string, messageIndex: number) => {
    try {
      setSpeakingMessageId(messageIndex);
      const startTime = performance.now();

      const audioData = await ttsAIRef.textToSpeech(text);
      setVoiceProcessingTime(performance.now() - startTime);
      if (audioData) {
        captureAnalytics('text_to_speech_generated', {
          textLength: text.length,
          processingTimeMs: performance.now() - startTime,
          memoryUsage: stats.memoryUsage,
        });

        const audioContext = new (window.AudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(audioData);
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);

        source.onended = () => {
          setSpeakingMessageId(null);
        };
        source.start();
      }
    } catch (error) {
      captureAnalytics('text_to_speech_error', {
        error: (error as Error).message,
        textLength: text.length,
        memoryUsage: stats.memoryUsage,
      });
      console.error('Error playing audio:', error);
      setSpeakingMessageId(null);
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

        const currentMemoryUsage = memory.usedJSHeapSize / (1024 * 1024);
        const maxMemory = memory.jsHeapSizeLimit / (1024 * 1024);

        if (Math.abs(currentMemoryUsage - stats.memoryUsage) / stats.memoryUsage > 0.1) {
          captureAnalytics('memory_usage_change', {
            previousUsage: stats.memoryUsage,
            currentUsage: currentMemoryUsage,
            maxMemory: maxMemory,
            peakMemoryUsage: stats.peakMemoryUsage,
          });
        }

        setStats(prev => ({
          ...prev,
          memoryUsage: currentMemoryUsage,
          maxMemory: maxMemory,
        }));
      }
    };

    const interval = setInterval(updateMemoryUsage, 1000);
    return () => clearInterval(interval);
  }, [stats.memoryUsage, stats.peakMemoryUsage]);

  const loadChatModel = async () => {
    try {
      const audioLoadStart = performance.now();
      setStatus('Loading audio model...');
      try {
        await audioAIRef.loadModel('whisper-tiny-en', {
          device: 'webgpu'
        });
        console.log('Audio model loaded successfully');
      } catch (error) {
        console.error('Error loading audio model:', error);
        throw error;
      }
      const audioLoadEnd = performance.now();
      const audioLoadTime = audioLoadEnd - audioLoadStart;
      setAudioProcessingTime(audioLoadTime);


      const ttsLoadStart = performance.now();
      setStatus('Loading TTS model...');
      try {
        await ttsAIRef.loadModel('kokoro-tts');
        console.log('TTS model loaded successfully');
      } catch (error) {
        console.error('Error loading TTS model:', error);
        throw error;
      }
      const ttsLoadEnd = performance.now();
      const ttsLoadTime = ttsLoadEnd - ttsLoadStart;
      setVoiceProcessingTime(ttsLoadTime);

      const chatLoadStart = performance.now();
      setStatus('Loading chat model...');
      try {
        await chatAIRef.loadModel(selectedModel);
        console.log('Chat model loaded successfully');
      } catch (error) {
        console.error('Error loading chat model:', error);
        throw error;
      }
      const chatLoadEnd = performance.now();
      const chatLoadTime = chatLoadEnd - chatLoadStart;
      setChatProcessingTime(chatLoadTime);

      setIsModelLoaded(true);
      setStatus('Ready');
    } catch (error) {
      console.error('Error in loadChatModel:', error);
      setStatus('Error loading models');
    }
  };

  return (
    <Container>
      <MainContent>
        <Title>BrowserAI Voice & Chat Demo</Title>

        <InfoSection>
          <InfoText>
            Select and load an AI model, then click the record button below to start a conversation!
            This demo uses <ModelBadge>Whisper-Tiny</ModelBadge> for speech recognition and <ModelBadge>SpeechT5-TTS</ModelBadge> for voice synthesis.
          </InfoText>
          <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', gap: '10px' }}>
            <ModelSelect
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={isModelLoaded}
            >
              <option value="smollm2-135m-instruct">SmolLM2 135M Instruct (360MB)</option>
              <option value="smollm2-360m-instruct">SmolLM2 360M Instruct (380MB)</option>
              <option value="smollm2-1.7b-instruct">SmolLM2 1.7B Instruct (1,75GB)</option>
              <option value="llama-3.2-1b-instruct">Llama 3.2 1B Instruct (880MB)</option>
              <option value="phi-3.5-mini-instruct">Phi 3.5 Mini Instruct (3.6GB)</option>
              <option value="qwen2.5-0.5b-instruct">Qwen2.5 0.5B Instruct (950MB)</option>
              <option value="qwen2.5-1.5b-instruct">Qwen2.5 1.5B Instruct (1.6GB)</option>
              <option value="gemma-2b-it">Gemma 2B Instruct (1.4GB)</option>
              <option value="tinyllama-1.1b-chat-v0.4">TinyLlama 1.1B Chat (670MB)</option>

            </ModelSelect>
            <LoadButton
              onClick={loadChatModel}
              disabled={isModelLoaded}
              isLoading={status.includes('Loading')}
            >
              {isModelLoaded ? 'Model Loaded' : 
               status.includes('Loading') ? status : 
               'Load Model'}
            </LoadButton>
          </div>
        </InfoSection>

        <ContentLayout>
          <ChatContainer>
            <AudioControls>
              <ActionButton
                onClick={isRecording ? stopRecording : startRecording}
                disabled={!isModelLoaded || (status !== 'Ready' && !isRecording)}
                isLoading={status !== 'Ready' && status !== 'Recording...'}
                isRecording={isRecording}
              >
                {!isModelLoaded ? 'Load Model First' :
                  status === 'Ready' && !isRecording ? 'Start Recording' :
                    isRecording ? 'Stop Recording' :
                      status}
              </ActionButton>
            </AudioControls>

            <ChatBox>
              {isRecording ? (
                <RecordingIndicator>
                  <WaveContainer>
                    <WaveBar />
                    <WaveBar />
                    <WaveBar />
                    <WaveBar />
                    <WaveBar />
                  </WaveContainer>
                  <RecordingText>Listening...</RecordingText>
                </RecordingIndicator>
              ) : messages.length > 0 ? (
                messages.map((message, index) => (
                  <MessageWrapper key={index}>
                    <Message isUser={message.isUser}>
                      {message.text}
                    </Message>
                    {!message.isUser && (
                      <SpeakButton
                        onClick={() => speakMessage(message.text, index)}
                        disabled={speakingMessageId !== null}
                        isLoading={speakingMessageId === index}
                      >
                        {speakingMessageId === index ? (
                          <Spinner style={{ width: '20px', height: '20px', border: '2px solid #fff' }} />
                        ) : (
                          '🔊'
                        )}
                      </SpeakButton>
                    )}
                  </MessageWrapper>
                ))
              ) : (
                <RecordingText style={{ color: '#666' }}>
                  Press "Start Recording" to begin
                </RecordingText>
              )}
            </ChatBox>
          </ChatContainer>

          <Sidebar>
            <h2 style={{ marginTop: '0px', marginBottom: '24px' }}>Performance Stats</h2>

            <StatItem>
              <h3>{actionType} Times</h3>
              <ProcessingMetric>
                <span className="label">Audio {actionType}</span>
                <span className="value">{(audioProcessingTime / 1000).toFixed(2)}s</span>
              </ProcessingMetric>
              <ProcessingMetric>
                <span className="label">Chat {actionType}</span>
                <span className="value">{(chatProcessingTime / 1000).toFixed(2)}s</span>
              </ProcessingMetric>
              <ProcessingMetric>
                <span className="label">Voice {actionType}</span>
                <span className="value">{(voiceProcessingTime / 1000).toFixed(2)}s</span>
              </ProcessingMetric>
            </StatItem>

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

          </Sidebar>
        </ContentLayout>
      </MainContent>
    </Container>
  );
}