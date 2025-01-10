import { useState, useEffect } from 'react';
import styled from '@emotion/styled';
import { BrowserAI } from '@browserai/browserai';

const Container = styled.div`
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
`;

const ModelSelect = styled.select`
  width: 100%;
  padding: 8px;
  margin-bottom: 20px;
`;

const ChatBox = styled.div`
  border: 1px solid #ccc;
  border-radius: 4px;
  height: 400px;
  overflow-y: auto;
  padding: 16px;
  margin-bottom: 20px;
`;

const Message = styled.div<{ isUser: boolean }>`
  background: ${props => props.isUser ? '#e3f2fd' : '#f5f5f5'};
  padding: 8px 12px;
  border-radius: 4px;
  margin: 8px 0;
  max-width: 80%;
  margin-left: ${props => props.isUser ? 'auto' : '0'};
  color: black;
`;

const InputContainer = styled.div`
  display: flex;
  gap: 8px;
`;

const Input = styled.input`
  flex: 1;
  padding: 8px;
`;

const Button = styled.button`
  padding: 8px 16px;
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
  padding: 20px;
`;

export default function ChatInterface() {
  const [browserAI] = useState(new BrowserAI());
  const [selectedModel, setSelectedModel] = useState('smollm2-135m-instruct');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Array<{ text: string; isUser: boolean }>>([]);
  const [input, setInput] = useState('');

  const loadModel = async () => {
    setLoading(true);
    try {
      await browserAI.loadModel(selectedModel, {
        onProgress: (progress: any) => {
          console.log(`Loading progress: ${progress.progress}%`);
        }
      });
    } catch (error) {
      console.error('Error loading model:', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadModel();
  }, [selectedModel]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = { text: input, isUser: true };
    setMessages(prev => [...prev, userMessage]);
    setInput('');

    try {
      const response = await browserAI.generateText(input);
      console.log("Response:", response);
      const aiMessage = { text: String(response), isUser: false };
      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error generating response:', error);
      const errorMessage = { text: 'Error generating response', isUser: false };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  return (
    <Container>
      <h1>BrowserAI Demo</h1>
      <ModelSelect value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
        <option value="smollm2-135m-instruct">SmolLM2 135M Instruct</option>
        <option value="smollm2-350m-instruct">SmolLM2 350M Instruct</option>
      </ModelSelect>

      {loading ? (
        <LoadingIndicator>
          <Spinner />
          <div>Loading model...</div>
        </LoadingIndicator>
      ) : (
        <>
          <ChatBox>
            {messages.map((message, index) => (
              <Message key={index} isUser={message.isUser}>
                {message.text}
              </Message>
            ))}
          </ChatBox>
          <InputContainer>
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleSend()}
              placeholder="Type your message..."
            />
            <Button onClick={handleSend}>Send</Button>
          </InputContainer>
        </>
      )}
    </Container>
  );
}