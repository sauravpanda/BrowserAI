import { useState } from 'react';
import { BrowserAI } from '@browserai/browserai';
import styled from '@emotion/styled';

const Banner = styled.div`
  background-color: #1a1a1a;
  padding: 0.75rem;
  text-align: center;
  border-bottom: 1px solid #333;
`;

const BannerLink = styled.a`
  color: #fff;
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`;

const Container = styled.div`
  max-width: 800px;
  margin: 2rem auto;
  padding: 0 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const Title = styled.h1`
  text-align: center;
  margin: 0;
  font-size: 2rem;
`;

const Subtitle = styled.p`
  text-align: center;
  color: #888;
  margin: 0.5rem 0 1.5rem;
  font-size: 1.1rem;
`;

const TextArea = styled.textarea`
  width: 100%;
  height: 150px;
  padding: 1rem;
  margin-bottom: 1rem;
  border-radius: 8px;
  background: #2a2a2a;
  color: white;
  border: 1px solid #444;
  resize: vertical;

  &:focus {
    outline: none;
    border-color: #4CAF50;
  }
`;

const Button = styled.button<{ isLoading?: boolean }>`
  background: ${props => props.isLoading ? '#666' : '#4CAF50'};
  color: white;
  padding: 0.8rem 1.5rem;
  border: none;
  border-radius: 4px;
  cursor: ${props => props.isLoading ? 'wait' : 'pointer'};
  font-size: 1rem;
  transition: all 0.3s ease;

  &:hover {
    opacity: ${props => props.isLoading ? 1 : 0.9};
  }

  &:disabled {
    background: #666;
    cursor: not-allowed;
  }
`;

const Spinner = styled.div`
  display: inline-block;
  width: 20px;
  height: 20px;
  margin-right: 8px;
  border: 2px solid #ffffff;
  border-radius: 50%;
  border-top-color: transparent;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const ButtonContent = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`;

const Status = styled.div`
  margin-top: 1rem;
  color: #888;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
`;

function App() {
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ttsAI] = useState(new BrowserAI());
  const [isModelLoaded, setIsModelLoaded] = useState(false);

  const loadModel = async () => {
    try {
      setIsLoading(true);
      await ttsAI.loadModel('kokoro-tts');
      setIsModelLoaded(true);
      setStatus('Model loaded! Ready to speak.');
    } catch (error) {
      setStatus('Error loading model: ' + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const speak = async () => {
    if (!text.trim()) {
      setStatus('Please enter some text first');
      return;
    }

    try {
      setIsLoading(true);
      setStatus('Generating speech...');
      const audioData = await ttsAI.textToSpeech(text);
      
      if (audioData) {
        // Create a blob with WAV MIME type
        const blob = new Blob([audioData], { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(blob);
        
        // Create and play audio element
        const audio = new Audio(audioUrl);
        
        audio.onended = () => {
          setStatus('Finished playing');
          setIsLoading(false);
          URL.revokeObjectURL(audioUrl); // Clean up
        };
        
        audio.onerror = (e) => {
          console.error('Audio playback error:', e);
          setStatus('Error playing audio');
          setIsLoading(false);
          URL.revokeObjectURL(audioUrl);
        };
        
        setStatus('Playing audio...');
        await audio.play();
      }
    } catch (error) {
      console.error('Error in speak:', error);
      setStatus('Error generating speech: ' + (error as Error).message);
      setIsLoading(false);
    }
  };

  return (
    <>
      <Banner>
        <BannerLink href="https://github.com/sauravpanda/browserai" target="_blank" rel="noopener noreferrer">
          ⭐ Check out BrowserAI on GitHub
        </BannerLink>
      </Banner>
      <Container>
        <div>
          <Title>Kokoro TTS Demo</Title>
          <Subtitle>A lightweight, browser-based text-to-speech engine</Subtitle>
        </div>
        
        <Button 
          onClick={loadModel} 
          disabled={isModelLoaded || isLoading}
          isLoading={isLoading && !isModelLoaded}
        >
          <ButtonContent>
            {(isLoading && !isModelLoaded) && <Spinner />}
            {isModelLoaded ? 'Model Loaded' : 'Load TTS Model'}
          </ButtonContent>
        </Button>

        <TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter text to convert to speech..."
          disabled={!isModelLoaded || isLoading}
        />

        <Button
          onClick={speak}
          disabled={!isModelLoaded || isLoading || !text.trim()}
          isLoading={isLoading && isModelLoaded}
        >
          <ButtonContent>
            {(isLoading && isModelLoaded) && <Spinner />}
            {isLoading ? 'Processing...' : 'Speak'}
          </ButtonContent>
        </Button>

        {(status || isLoading) && (
          <Status>
            {isLoading && <Spinner />}
            {status}
          </Status>
        )}
      </Container>
    </>
  );
}

export default App;