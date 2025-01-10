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
  height: 500px;
  width: 100%;
  overflow-y: auto;
  padding: 20px;
  margin-bottom: 20px;
  background: #2a2a2a;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);

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
  padding: 12px 16px;
  border-radius: 12px;
  margin: 8px 0;
  max-width: 80%;
  margin-left: ${props => props.isUser ? 'auto' : '0'};
  color: ${props => props.isUser ? '#fff' : '#fff'};
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
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

const ActionButton = styled.button<{ isRecording?: boolean }>`
  background-color: ${props => props.isRecording ? '#ff4444' : '#4CAF50'};
  color: white;
  padding: 12px 24px;
  border-radius: 24px;
  border: none;
  cursor: pointer;
  transition: all 0.3s ease;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;

  &:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  &:disabled {
    background-color: #444;
    cursor: not-allowed;
    transform: none;
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

export default function ChatInterface() {
  const [audioAI] = useState(new BrowserAI());
  const [chatAI] = useState(new BrowserAI());
  const [status, setStatus] = useState('Initializing...');
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState<Array<{ text: string; isUser: boolean }>>([]);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [isAITyping, setIsAITyping] = useState(false);
  const [textInput, setTextInput] = useState('');

  useEffect(() => {
    const init = async () => {
      try {
        setStatus('Loading audio model...');
        await audioAI.loadModel('whisper-tiny-en');
        
        setStatus('Loading chat model...');
        await chatAI.loadModel('smollm2-135m-instruct');
        
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
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      setMediaRecorder(recorder);
      
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
      const transcription = await audioAI.transcribeAudio(audioBlob);
      
      const transcribedText = transcription.text || '';
      setMessages(prev => [...prev, { text: transcribedText, isUser: true }]);

      setIsAITyping(true);
      try {
        const response = await chatAI.generateText(transcribedText, {
          maxTokens: 100,
          temperature: 0.7,
          system_prompt: "You are a helpful assistant who answers questions about the user's input in short and concise manner."
        });
        
        const responseText = response?.toString() || 'No response';
        setMessages(prev => [...prev, { text: responseText, isUser: false }]);
      } catch (error) {
        console.error('Error generating response:', error);
        setMessages(prev => [...prev, { text: 'Error generating response', isUser: false }]);
      } finally {
        setIsAITyping(false);
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
    setIsAITyping(true);
    
    try {
      const response = await chatAI.generateText(textInput);
      setMessages(prev => [...prev, { text: response as string, isUser: false }]);
    } catch (error) {
      console.error('Error generating response:', error);
      setMessages(prev => [...prev, { text: 'Error generating response', isUser: false }]);
    } finally {
      setIsAITyping(false);
      setTextInput('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  return (
    <Container>
      <MainContent>
        <Title>BrowserAI Voice & Chat Demo</Title>
        
        {status !== 'Ready' && <LoadingIndicator>
          <Spinner />
          <div>{status}</div>
        </LoadingIndicator>}
        
        <ChatBox>
          {messages.map((message, index) => (
            <Message key={index} isUser={message.isUser}>
              {message.text}
            </Message>
          ))}
          {isAITyping && (
            <Message isUser={false}>
              <TypingIndicator>AI is typing...</TypingIndicator>
            </Message>
          )}
        </ChatBox>

        <InputSection>
          <AudioControls>
            {!isRecording ? (
              <ActionButton
                onClick={startRecording}
                disabled={status !== 'Ready'}
              >
                Start Recording
              </ActionButton>
            ) : (
              <ActionButton
                isRecording={true}
                onClick={stopRecording}
                disabled={status !== 'Recording...'}
              >
                Stop Recording
              </ActionButton>
            )}
          </AudioControls>

          <TextInputContainer>
            <TextInput
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message here..."
              disabled={status !== 'Ready'}
            />
            <SendButton
              onClick={handleSendMessage}
              disabled={!textInput.trim() || status !== 'Ready'}
            >
              Send
            </SendButton>
          </TextInputContainer>
        </InputSection>
      </MainContent>
    </Container>
  );
}