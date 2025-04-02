import { useState, useRef, useEffect } from 'react';
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

const ButtonGroup = styled.div`
  display: flex;
  gap: 1rem;
  justify-content: center;
`;

const Select = styled.select`
  width: 100%;
  padding: 0.8rem;
  border-radius: 8px;
  background: #2a2a2a;
  color: white;
  border: 1px solid #444;
  margin-bottom: 1rem;

  &:focus {
    outline: none;
    border-color: #4CAF50;
  }
`;

const InputGroup = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
`;

const RangeInput = styled.input`
  width: 100%;
  background: #2a2a2a;
  -webkit-appearance: none;
  height: 8px;
  border-radius: 4px;
  margin: 10px 0;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    background: #4CAF50;
    border-radius: 50%;
    cursor: pointer;
  }
`;

const Label = styled.label`
  color: #888;
  margin-bottom: 0.5rem;
  display: block;
`;

const VOICE_OPTIONS = [
  { id: 'af_bella', name: 'Bella', language: 'en-us', gender: 'Female' },
  { id: 'af_nicole', name: 'Nicole', language: 'en-us', gender: 'Female' },
  { id: 'af_sarah', name: 'Sarah', language: 'en-us', gender: 'Female' },
  { id: 'af_sky', name: 'Sky', language: 'en-us', gender: 'Female' },
  { id: 'am_adam', name: 'Adam', language: 'en-us', gender: 'Male' },
  { id: 'am_michael', name: 'Michael', language: 'en-us', gender: 'Male' },
  { id: 'bf_emma', name: 'Emma', language: 'en-gb', gender: 'Female' },
  { id: 'bf_isabella', name: 'Isabella', language: 'en-gb', gender: 'Female' },
  { id: 'bm_george', name: 'George', language: 'en-gb', gender: 'Male' },
  { id: 'bm_lewis', name: 'Lewis', language: 'en-gb', gender: 'Male' },
  { id: 'hf_alpha', name: 'Alpha', language: 'hi', gender: 'Female' },
  { id: 'hf_beta', name: 'Beta', language: 'hi', gender: 'Female' },
  { id: 'hm_omega', name: 'Omega', language: 'hi', gender: 'Male' },
  { id: 'hm_psi', name: 'Psi', language: 'hi', gender: 'Male' },
];

function App() {
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ttsAI] = useState(new BrowserAI());
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('af_bella');
  const [speed, setSpeed] = useState(1.0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  
  // Audio streaming references
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const accumulatedAudioChunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef<number>(24000);

  // Clean up audio context on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);
  
  // Create WAV header
  const createWAVHeader = (numChannels: number, sampleRate: number, numSamples: number): ArrayBuffer => {
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);

    // "RIFF" chunk descriptor
    writeString(view, 0, 'RIFF');
    // File size (data size + 36 bytes of header)
    view.setUint32(4, 36 + numSamples * 2, true);
    writeString(view, 8, 'WAVE');

    // "fmt " sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // audio format (1 for PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true); // byte rate
    view.setUint16(32, numChannels * 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample

    // "data" sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, numSamples * 2, true); // data size

    return buffer;
  };

  // Helper function to write string to DataView
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  const initializeAudioContext = () => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      const context = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = context;
      nextPlayTimeRef.current = context.currentTime; // Initialize play time
      return context;
    }
    return audioContextRef.current;
  };

  const playAudioChunk = (context: AudioContext, chunk: Float32Array, sampleRate: number) => {
    const buffer = context.createBuffer(1, chunk.length, sampleRate);
    buffer.copyToChannel(chunk, 0);

    const node = context.createBufferSource();
    node.buffer = buffer;
    node.connect(context.destination);

    // Schedule playback precisely
    const scheduledTime = Math.max(context.currentTime, nextPlayTimeRef.current);
    node.start(scheduledTime);

    // Update the time for the next chunk
    nextPlayTimeRef.current = scheduledTime + buffer.duration;

    return node;
  };

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
    if (!isModelLoaded || isLoading) return;

    setIsLoading(true);
    setStatus('Generating speech stream...');
    
    // Reset any previous audio state
    accumulatedAudioChunksRef.current = [];
    isPlayingRef.current = true;

    const currentAudioContext = initializeAudioContext();
    if (!currentAudioContext) {
      setStatus('Failed to initialize Audio Context');
      setIsLoading(false);
      return;
    }
    
    // Ensure audio context is running (required after user interaction)
    if (currentAudioContext.state === 'suspended') {
      await currentAudioContext.resume();
    }
    
    // Reset nextPlayTime for new playback
    nextPlayTimeRef.current = currentAudioContext.currentTime;

    try {
      // Get language from selected voice
      const selectedVoiceData = VOICE_OPTIONS.find(v => v.id === selectedVoice);
      if (!selectedVoiceData) {
        throw new Error("Selected voice data not found.");
      }
      const language = selectedVoiceData.language;

      const result = await ttsAI.textToSpeech(text, {
        voice: selectedVoice,
        speed: speed,
        language: language // Pass explicit language code
      });
      
      // Extract stream and sampleRate from the result
      const { stream, sampleRate } = result;

      // Store sample rate for WAV generation
      sampleRateRef.current = sampleRate;

      // Reset accumulated chunks
      accumulatedAudioChunksRef.current = [];
      
      // Clear any previous audio blob
      setAudioBlob(null);

      setStatus('Streaming audio...');
      let chunksProcessed = 0;

      // Process each chunk from the stream
      for await (const chunk of stream) {
        if (!isPlayingRef.current) break; // Allow stopping
        
        // Store the chunk for potential download later
        accumulatedAudioChunksRef.current.push(chunk);
        
        // Play this chunk
        playAudioChunk(currentAudioContext, chunk, sampleRate);
        
        // Update status occasionally to show progress
        chunksProcessed++;
        if (chunksProcessed % 10 === 0) {
          setStatus('Streaming audio...');
        }
      }

      // Calculate when all audio will finish playing
      const estimatedDuration = nextPlayTimeRef.current - currentAudioContext.currentTime;
      const finishingDelay = Math.max(estimatedDuration * 1000, 100); // At least 100ms
      
      setTimeout(() => {
        if (isPlayingRef.current) {
          // Create blob for download
          if (accumulatedAudioChunksRef.current.length > 0) {
            // Calculate total length of all chunks
            const totalLength = accumulatedAudioChunksRef.current.reduce((total, chunk) => total + chunk.length, 0);
            
            // Create a combined Float32Array
            const combinedFloat32 = new Float32Array(totalLength);
            let offset = 0;
            
            // Copy all chunks into the combined array
            for (const chunk of accumulatedAudioChunksRef.current) {
              combinedFloat32.set(chunk, offset);
              offset += chunk.length;
            }
            
            // Normalize if needed - skip this as chunks are already normalized
            // const maxValue = combinedFloat32.reduce((max, val) => Math.max(max, Math.abs(val)), 0);
            // const normalizedData = maxValue > 0 ? new Float32Array(combinedFloat32.length) : combinedFloat32;
            
            // if (maxValue > 0) {
            //   for (let i = 0; i < combinedFloat32.length; i++) {
            //     normalizedData[i] = combinedFloat32[i] / maxValue;
            //   }
            // }
            
            // Convert to Int16Array for WAV
            const int16Array = new Int16Array(combinedFloat32.length);
            const int16Factor = 0x7FFF;
            
            for (let i = 0; i < combinedFloat32.length; i++) {
              const s = combinedFloat32[i];
              int16Array[i] = s < 0 ? Math.max(-0x8000, s * 0x8000) : Math.min(0x7FFF, s * int16Factor);
            }
            
            // Create WAV header
            const wavHeader = createWAVHeader(1, sampleRateRef.current, int16Array.length);
            
            // Combine header with audio data
            const wavBytes = new Uint8Array(44 + int16Array.byteLength);
            wavBytes.set(new Uint8Array(wavHeader), 0);
            wavBytes.set(new Uint8Array(int16Array.buffer), 44);
            
            // Create blob for download
            const blob = new Blob([wavBytes], { type: 'audio/wav' });
            setAudioBlob(blob);
          }
          
          console.log(`Finished playing stream (${chunksProcessed} total chunks)`);
          setStatus('Finished playing stream');
          setIsLoading(false);
          isPlayingRef.current = false;
        }
      }, finishingDelay);

    } catch (error) {
      console.error('Error in speech stream:', error);
      setStatus('Error generating or playing stream: ' + (error as Error).message);
      setIsLoading(false);
      isPlayingRef.current = false;
    }
  };

  const stopSpeak = () => {
    isPlayingRef.current = false;
    setIsLoading(false);
    setStatus('Playback stopped.');
    
    // Reset audio context time tracking
    if (audioContextRef.current) {
      nextPlayTimeRef.current = audioContextRef.current.currentTime;
    }
  };
  
  const downloadAudio = () => {
    if (!audioBlob) {
      setStatus('No audio data available to download');
      return;
    }
    
    const url = URL.createObjectURL(audioBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'generated-speech.wav';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    setStatus('Audio downloaded successfully');
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
          <Subtitle>A lightweight, browser-based text-to-speech engine with streaming</Subtitle>
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

        <InputGroup>
          <div style={{ flex: 1 }}>
            <Label>Voice</Label>
            <Select
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              disabled={!isModelLoaded || isLoading}
            >
              {VOICE_OPTIONS.map(voice => (
                <option key={voice.id} value={voice.id}>
                  {voice.name} ({voice.language}, {voice.gender})
                </option>
              ))}
            </Select>
          </div>
          <div style={{ flex: 1 }}>
            <Label>Speed: {speed.toFixed(1)}x</Label>
            <RangeInput
              type="range"
              min="0.2"
              max="2"
              step="0.1"
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              disabled={!isModelLoaded || isLoading}
            />
          </div>
        </InputGroup>

        <TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter text to convert to speech..."
          disabled={!isModelLoaded || isLoading}
        />

        <ButtonGroup>
          <Button
            onClick={speak}
            disabled={!isModelLoaded || isLoading || !text.trim()}
            isLoading={isLoading}
          >
            <ButtonContent>
              {isLoading && <Spinner />}
              {isLoading ? 'Streaming...' : 'Speak'}
            </ButtonContent>
          </Button>
          
          {isLoading && (
            <Button onClick={stopSpeak}>
              <ButtonContent>
                Stop
              </ButtonContent>
            </Button>
          )}
          
          {audioBlob && !isLoading && (
            <Button onClick={downloadAudio}>
              <ButtonContent>
                Download Audio
              </ButtonContent>
            </Button>
          )}
        </ButtonGroup>

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