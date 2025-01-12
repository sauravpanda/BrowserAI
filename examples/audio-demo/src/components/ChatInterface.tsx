import React, { useState, useEffect } from 'react';
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
`;

const ChatBox = styled.div`
  border: 1px solid #333;
  border-radius: 12px;
  height: 600px;
  width: 100%;
  overflow-y: auto;
  padding: 20px;
  margin-bottom: 20px;
  background: #2a2a2a;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;

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
  background: ${props => props.isUser ? '#4CAF50' : '#333'};
  padding: 16px 24px;
  border-radius: 16px;
  margin: 12px 0;
  max-width: 90%;
  text-align: center;
  font-size: 1.2rem;
  line-height: 1.5;
  transform: scale(0);
  animation: popIn 0.3s ease-out forwards;

  @keyframes popIn {
    0% { transform: scale(0); }
    70% { transform: scale(1.1); }
    100% { transform: scale(1); }
  }
`;

const InputSection = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: #2a2a2a;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
`;

const TextInputContainer = styled.div`
  display: flex;
  gap: 10px;
  width: 100%;
`;

const TextInput = styled.input`
  flex: 1;
  padding: 12px 16px;
  border: 1px solid #444;
  border-radius: 24px;
  font-size: 16px;
  outline: none;
  background: #333;
  color: #fff;
  transition: all 0.3s ease;

  &:focus {
    border-color: #4CAF50;
    box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.2);
  }

  &::placeholder {
    color: #888;
  }
`;

const ActionButton = styled.button<{ isRecording?: boolean; isLoading?: boolean }>`
  background-color: ${props => {
    if (props.isLoading) return '#666';
    return props.isRecording ? '#ff4444' : '#4CAF50';
  }};
  color: white;
  padding: 12px 24px;
  border-radius: 24px;
  border: none;
  cursor: ${props => props.isLoading ? 'wait' : 'pointer'};
  transition: all 0.3s ease;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  position: relative;
  overflow: hidden;

  &:hover {
    opacity: ${props => props.isLoading ? 1 : 0.9};
    transform: ${props => props.isLoading ? 'none' : 'translateY(-1px)'};
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

const SendButton = styled(ActionButton)`
  min-width: 100px;
  background-color: #4CAF50;
`;

const AudioControls = styled.div`
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-bottom: 20px;
`;

const LoadingIndicator = styled.div`
  text-align: center;
  color: #fff;
  padding: 20px;
  background: #2a2a2a;
  border-radius: 12px;
  margin: 20px 0;
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

const TypingIndicator = styled.div`
  padding: 8px 12px;
  font-style: italic;
  color: #888;
  display: flex;
  align-items: center;
  gap: 8px;

  &::after {
    content: '...';
    animation: ellipsis 1.4s infinite;
  }

  @keyframes ellipsis {
    0% { content: '.'; }
    33% { content: '..'; }
    66% { content: '...'; }
  }
`;

const AudioButton = styled(ActionButton)`
  padding: 8px;
  min-width: 40px;
  background-color: #2196F3;
  margin-left: 8px;
`;

const MessageContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
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
  background: rgba(76, 175, 80, 0.1);
  border: 1px solid rgba(76, 175, 80, 0.2);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 24px;
  text-align: center;
  max-width: 500px;
  width: 100%;
`;

const InfoText = styled.p`
  color: #9e9e9e;
  font-size: 0.95rem;
  line-height: 1.5;
  margin: 0;
`;

const ModelBadge = styled.span`
  background: rgba(76, 175, 80, 0.2);
  color: #4CAF50;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.9rem;
  margin: 0 4px;
`;

const MetricsContainer = styled.div`
  display: flex;
  gap: 20px;
  justify-content: center;
  margin-top: 20px;
  flex-wrap: wrap;
`;

const MetricCard = styled.div`
  background: rgba(33, 33, 33, 0.6);
  border: 1px solid rgba(76, 175, 80, 0.2);
  border-radius: 8px;
  padding: 12px 20px;
  min-width: 160px;
  text-align: center;
  backdrop-filter: blur(5px);
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
  const [textInput, setTextInput] = useState('');
  const [ttsAI] = useState(new BrowserAI());
  const [audioProcessingTime, setAudioProcessingTime] = useState<number>(0);
  const [chatProcessingTime, setChatProcessingTime] = useState<number>(0);

  useEffect(() => {
    const init = async () => {
      try {
        setStatus('Loading audio model...');
        await audioAI.loadModel('whisper-tiny-en', { onProgress: (progress: any) => {
          console.log(`Audio model loading progress: ${progress.progress}`);
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
      const audioStartTime = performance.now();
      const audioBlob = await audioAI.stopRecording();
      setIsRecording(false);
      
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
        
        // Automatically speak the AI response
        await speakMessage(responseText, messages.length);
        
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

  const handleSendMessage = async () => {
    if (!textInput.trim()) return;
    
    setMessages(prev => [...prev, { text: textInput, isUser: true }]);
    
    try {
      const response = await chatAI.generateText(textInput);
      setMessages(prev => [...prev, { text: response as string, isUser: false }]);
      
      // Automatically speak the AI response
      await speakMessage(response as string, messages.length);
      
    } catch (error) {
      console.error('Error generating response:', error);
      setMessages(prev => [...prev, { text: 'Error generating response', isUser: false }]);
    } finally {
      setTextInput('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  const speakMessage = async (text: string, messageIndex: number) => {
    try {
      setMessages(prev => prev.map((msg, idx) => ({
        ...msg,
        isPlaying: idx === messageIndex
      })));

      const audioData = await ttsAI.textToSpeech(text);
      
      console.log('audioData', audioData);
      // Create audio context
      const audioContext = new (window.AudioContext)();
      
      // Decode the audio data
      const audioBuffer = await audioContext.decodeAudioData(audioData);
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      
      source.onended = () => {
        setMessages(prev => prev.map(msg => ({
          ...msg,
          isPlaying: false
        })));
      };

      source.start();
    } catch (error) {
      console.error('Error playing audio:', error);
      setMessages(prev => prev.map(msg => ({
        ...msg,
        isPlaying: false
      })));
    }
  };

  return (
    <Container>
      <MainContent>
        <Title>BrowserAI Voice & Chat Demo</Title>
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
              <Message key={index} isUser={message.isUser}>
                {message.text}
              </Message>
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
  );
}