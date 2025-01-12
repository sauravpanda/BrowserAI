import { useState, useEffect } from 'react';
import styled from '@emotion/styled';
import { BrowserAI } from '@browserai/browserai';

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
  max-width: 800px;
  padding: 20px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
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

const MetricsContainer = styled.div`
  display: flex;
  gap: 20px;
  justify-content: center;
  margin-top: 20px;
  flex-wrap: wrap;
`;

const MetricCard = styled.div`
  background: rgba(33, 33, 33, 0.7);
  border: 1px solid rgba(76, 175, 80, 0.2);
  border-radius: 12px;
  padding: 16px 24px;
  min-width: 180px;
  text-align: center;
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 25px rgba(0, 0, 0, 0.2);
  }
`;

const MetricLabel = styled.div`
  color: #888;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
`;

const MetricValue = styled.div`
  color: #4CAF50;
  font-size: 1.1rem;
  font-weight: 500;
`;

const SpeakButton = styled(ActionButton)`
  padding: 8px;
  min-width: 40px;
  background-color: #2196F3;
  margin-left: 8px;
`;

const MessageWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 90%;
`;

type Message = {
  text: string;
  isUser: boolean;
};

export default function ChatInterface() {
  const [audioAI] = useState(new BrowserAI());
  const [chatAI] = useState(new BrowserAI());
  const [status, setStatus] = useState('Initializing...');
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [ttsAI] = useState(new BrowserAI());
  const [audioProcessingTime, setAudioProcessingTime] = useState<number>(0);
  const [chatProcessingTime, setChatProcessingTime] = useState<number>(0);
  const [speakingMessageId, setSpeakingMessageId] = useState<number | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        setStatus('Loading audio model...');
        await audioAI.loadModel('whisper-tiny-en', { onProgress: (progress: any) => {
          if (progress.progress == 100)
          console.log(`Audio model loaded: ${progress.progress}`);
        } });
        
        setStatus('Loading chat model...');
        await chatAI.loadModel('smollm2-135m-instruct');

        setStatus('Loading TTS model...');
        await ttsAI.loadModel('speecht5-tts');
        
        setStatus('Ready');
      } catch (error) {
        console.error('Initialization error:', error);
        setStatus('Error initializing');
      }
    };
    init();
  }, []);

  const startRecording = async () => {
    try {
      setIsRecording(true);
      setStatus('Recording...');
      setMessages([]);
      await audioAI.startRecording();
    } catch (error) {
      console.error('Recording error:', error);
      setStatus('Error recording');
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    try {
      setStatus('Processing...');
      const audioBlob = await audioAI.stopRecording();
      setIsRecording(false);
      const audioStartTime = performance.now();
      const transcription = await audioAI.transcribeAudio(audioBlob);
      const audioEndTime = performance.now();
      setAudioProcessingTime(audioEndTime - audioStartTime);
      
      const transcribedText = (transcription as { text: string }).text;
      setMessages(prev => [...prev, { text: transcribedText, isUser: true }]);

      try {
        const chatStartTime = performance.now();
        const response = await chatAI.generateText(transcribedText, {
          maxTokens: 100,
          temperature: 0.7,
          system_prompt: "You are a helpful assistant who answers questions about the user's input in short and concise manner. Keep answer to 3-5 sentences. "
        });
        const chatEndTime = performance.now();
        setChatProcessingTime(chatEndTime - chatStartTime);
        
        const responseText = response?.toString() || 'No response';
        setMessages(prev => [...prev, { text: responseText, isUser: false }]);
        
        
      } catch (error) {
        console.error('Error generating response:', error);
        setMessages(prev => [...prev, { text: 'Error generating response', isUser: false }]);
      }
      
    } catch (error) {
      console.error('Processing error:', error);
      setStatus('Error processing');
    } finally {
      setIsRecording(false);
      setStatus('Ready');
    }
  };

  const speakMessage = async (text: string, messageIndex: number) => {
    try {
      setSpeakingMessageId(messageIndex);
      const audioData = await ttsAI.textToSpeech(text);
      
      const audioContext = new (window.AudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(audioData);
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      
      source.onended = () => {
        setSpeakingMessageId(null);
      };

      source.start();
    } catch (error) {
      console.error('Error playing audio:', error);
      setSpeakingMessageId(null);
    }
  };

  return (
    <div className="flex flex-col h-screen">
      <Container>
        <MainContent>
          <Title>BrowserAI Voice & Chat Demo</Title>
          <div className="text-center mb-4 text-sm text-gray-500">
            Built using <a 
              href="https://github.com/sauravpanda/browserai" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-700 underline"
            >
              BrowserAI
            </a>
          </div>
          <InfoSection>
            <InfoText>
              I am a <ModelBadge>Smollm2</ModelBadge> AI model powered by 
              <ModelBadge>Whisper</ModelBadge> running locally in your browser. 
              Click the record button below to start a conversation with me!
            </InfoText>
          </InfoSection>

          <AudioControls>
            <ActionButton
              onClick={isRecording ? stopRecording : startRecording}
              disabled={status !== 'Ready' && !isRecording}
              isLoading={status !== 'Ready' && status !== 'Recording...'}
              isRecording={isRecording}
            >
              {status === 'Ready' && !isRecording ? 'Start Recording' : 
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
          
          {(audioProcessingTime > 0 || chatProcessingTime > 0) && (
            <MetricsContainer>
              <MetricCard>
                <MetricLabel>Audio Processing</MetricLabel>
                <MetricValue>{(audioProcessingTime / 1000).toFixed(2)}s</MetricValue>
              </MetricCard>
              <MetricCard>
                <MetricLabel>Chat Processing</MetricLabel>
                <MetricValue>{(chatProcessingTime / 1000).toFixed(2)}s</MetricValue>
              </MetricCard>
            </MetricsContainer>
          )}
        </MainContent>
      </Container>
    </div>
  );
}