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

const StatusDetail = styled.span<{ isHighlight?: boolean }>`
  color: ${props => props.isHighlight ? '#4CAF50' : '#888'};
  font-weight: ${props => props.isHighlight ? 'bold' : 'normal'};
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
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
  
  @media (max-width: 768px) {
    flex-direction: column;
  }
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

// These components were removed as they are no longer used

// Voice options
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
  // State variables
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ttsAI] = useState(new BrowserAI());
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [selectedVoice, setSelectedVoice] = useState('af_bella');
  const [speed, setSpeed] = useState(1.0);
  // Standard/streaming tab selection removed - now only streaming is supported
  const [streamingProgress, setStreamingProgress] = useState(0);
  const [isStreamPlaying, setIsStreamPlaying] = useState(false);
  const [streamingStats, setStreamingStats] = useState({
    chunksReceived: 0,
    chunksPlayed: 0,
    totalChunks: 0
  });

  // Refs for audio handling
  const audioContext = useRef<AudioContext | null>(null);
  const audioBufferQueue = useRef<any[]>([]);
  const nextStartTime = useRef<number>(0);
  const isAudioPlaying = useRef<boolean>(false);
  const streamController = useRef<AbortController | null>(null);
  const allChunksBuffer = useRef<ArrayBuffer[]>([]);
  
  // Initialize AudioContext when needed
  // AudioContext is created on demand when needed
  
  // Cleanup AudioContext when component unmounts
  useEffect(() => {
    return () => {
      if (audioContext.current) {
        audioContext.current.close();
        audioContext.current = null;
      }
      if (streamController.current) {
        streamController.current.abort();
        streamController.current = null;
      }
    };
  }, []);

  // Play queued audio buffers
  const playQueuedAudio = () => {
    if (!audioContext.current || audioBufferQueue.current.length === 0 || isAudioPlaying.current) {
      return;
    }

    console.log(`[STREAM-TEST] Starting audio playback from queue, queue size: ${audioBufferQueue.current.length}`);
    isAudioPlaying.current = true;
    
    const playNextBuffer = () => {
      if (audioBufferQueue.current.length === 0) {
        console.log(`[STREAM-TEST] Queue empty, playback complete`);
        isAudioPlaying.current = false;
        setIsStreamPlaying(false);
        setStatus('Playback complete');
        setIsLoading(false);
        return;
      }

      const bufferWithMeta = audioBufferQueue.current.shift();
      if (!bufferWithMeta || !audioContext.current) return;
      
      const buffer = bufferWithMeta.buffer;
      const chunkIndex = bufferWithMeta.metadata?.chunkIndex || 0;

      const source = audioContext.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.current.destination);
      
      // Schedule this buffer to play at the correct time
      const startTime = Math.max(audioContext.current.currentTime, nextStartTime.current);
      source.start(startTime);
      
      // Calculate delay before playback
      const delay = startTime - audioContext.current.currentTime;
      
      // Update next start time to be after this buffer
      nextStartTime.current = startTime + buffer.duration;
      
      // Update stats - use the actual chunk index plus 1 for display
      const chunkNumber = chunkIndex + 1;
      setStreamingStats(prev => ({
        ...prev,
        chunksPlayed: chunkNumber
      }));
      
      console.log(`[STREAM-TEST] Playing buffer #${chunkNumber}: duration=${buffer.duration.toFixed(2)}s, scheduled delay=${delay.toFixed(3)}s`);
      
      // When this buffer ends, check if we need to play the next one
      source.onended = () => {
        console.log(`[STREAM-TEST] Buffer #${chunkNumber} finished playing`);
        setStreamingProgress(Math.min(
          ((chunkNumber) / Math.max(streamingStats.totalChunks, 1)) * 100,
          99.9
        ));
        setTimeout(playNextBuffer, 0);
      };
    };

    playNextBuffer();
  };

  // Process audio chunk into a buffer and add to queue
  const processAudioChunk = async (chunk: ArrayBuffer, isFirstChunk: boolean, metadata?: any) => {
    if (!audioContext.current) {
      audioContext.current = new AudioContext({ sampleRate: 24000 });
    }
    
    try {
      // Debug log for streaming verification
      console.log(`[STREAM-TEST] Processing chunk: ${isFirstChunk ? 'FIRST' : 'subsequent'}, size: ${chunk.byteLength} bytes`);
      
      // Store buffer for potential download
      allChunksBuffer.current.push(chunk);
      
      // For first chunk with WAV header, we need to decode it as a WAV file
      // For subsequent chunks (raw PCM), we need to manually create an AudioBuffer
      let audioBuffer: AudioBuffer;
      
      if (isFirstChunk) {
        // Decode WAV data (includes header)
        audioBuffer = await audioContext.current.decodeAudioData(chunk.slice(0));
        console.log(`[STREAM-TEST] First chunk decoded: duration=${audioBuffer.duration.toFixed(2)}s`);
      } else {
        // Convert Int16 PCM data to Float32
        const int16Data = new Int16Array(chunk);
        const float32Data = new Float32Array(int16Data.length);
        
        for (let i = 0; i < int16Data.length; i++) {
          // Convert Int16 to normalized Float32
          float32Data[i] = int16Data[i] / 32768.0;
        }
        
        // Create AudioBuffer (mono)
        audioBuffer = audioContext.current.createBuffer(1, float32Data.length, audioContext.current.sampleRate);
        audioBuffer.getChannelData(0).set(float32Data);
        console.log(`[STREAM-TEST] Subsequent chunk processed: samples=${int16Data.length}, duration=${audioBuffer.duration.toFixed(2)}s`);
      }
      
      // Add to the queue with metadata
      audioBufferQueue.current.push({
        buffer: audioBuffer,
        metadata: {
          chunkIndex: metadata?.chunkIndex || 0,
          isFirstChunk
        }
      });
      console.log(`[STREAM-TEST] Queue size: ${audioBufferQueue.current.length} chunks`);
      
      // Start playback if not already playing
      if (!isAudioPlaying.current) {
        console.log(`[STREAM-TEST] Starting playback`);
        playQueuedAudio();
      }
    } catch (error) {
      console.error("Error processing audio chunk:", error);
    }
  };

  // Load the TTS model
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

  // Non-streaming TTS implementation removed, only streaming is now supported

  // Streaming TTS implementation
  const speakStreaming = async () => {
    if (!text.trim()) {
      setStatus('Please enter some text first');
      return;
    }

    try {
      console.log(`[STREAM-TEST] ====== STARTING STREAMING TTS TEST ======`);
      console.log(`[STREAM-TEST] Text length: ${text.length} characters`);
      
      // Reset state for new streaming session
      setIsLoading(true);
      setIsStreamPlaying(true);
      setStatus('Initializing streaming speech...');
      setStreamingProgress(0);
      
      // Reset audio context and queue
      if (audioContext.current) {
        await audioContext.current.close();
      }
      audioContext.current = new AudioContext({ sampleRate: 24000 });
      console.log(`[STREAM-TEST] Created new AudioContext with sample rate: ${audioContext.current.sampleRate}Hz`);
      
      audioBufferQueue.current = [];
      nextStartTime.current = 0;
      isAudioPlaying.current = false;
      allChunksBuffer.current = [];
      
      // Reset streaming stats
      setStreamingStats({
        chunksReceived: 0,
        chunksPlayed: 0,
        totalChunks: 0
      });
      
      // Create abort controller for cancellation
      if (streamController.current) {
        streamController.current.abort();
      }
      streamController.current = new AbortController();
      console.log(`[STREAM-TEST] Calling BrowserAI.textToSpeechStream()`);
      
      // Start streaming TTS - use type assertion as a temporary workaround
      // This is needed because the TypeScript definitions in the built library 
      // haven't been updated to include the new textToSpeechStream method
      const streamGenerator = (ttsAI as any).textToSpeechStream(text, {
        voice: selectedVoice,
        speed: speed
      });
      
      let firstChunkProcessed = false;
      let startTime = performance.now();
      let chunkNumber = 0;
      
      for await (const chunk of streamGenerator) {
        chunkNumber++;
        const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
        console.log(`[STREAM-TEST] Received chunk #${chunkNumber} after ${elapsed}s`);
        
        if (streamController.current?.signal.aborted) {
          console.log(`[STREAM-TEST] Streaming aborted`);
          break;
        }
        
        // Update status after first chunk arrives
        if (!firstChunkProcessed) {
          console.log(`[STREAM-TEST] First chunk received, time to first chunk: ${elapsed}s`);
          setStatus('Started streaming playback...');
          firstChunkProcessed = true;
        }
        
        // Log chunk metadata
        console.log(`[STREAM-TEST] Chunk metadata:`, {
          isFirstChunk: chunk.isFirstChunk,
          chunkIndex: chunk.metadata?.chunkIndex,
          totalChunks: chunk.metadata?.totalChunks
        });
        
        // Update streaming stats
        setStreamingStats(prev => ({
          ...prev,
          chunksReceived: prev.chunksReceived + 1,
          totalChunks: chunk.metadata?.totalChunks || prev.totalChunks
        }));
        
        // Process this chunk
        await processAudioChunk(chunk.buffer, chunk.isFirstChunk, chunk.metadata);
      }
      
      const totalTime = ((performance.now() - startTime) / 1000).toFixed(2);
      console.log(`[STREAM-TEST] All chunks received. Total time: ${totalTime}s, Total chunks: ${chunkNumber}`);
      
      // Create combined blob for download after all chunks are received
      if (allChunksBuffer.current.length > 0) {
        const combinedBlob = new Blob(allChunksBuffer.current, { type: 'audio/wav' });
        setAudioBlob(combinedBlob);
        console.log(`[STREAM-TEST] Created combined audio blob, size: ${(combinedBlob.size / 1024).toFixed(2)}KB`);
      }
      
      setStreamingProgress(100);
      if (!streamController.current?.signal.aborted) {
        setStatus('Playing audio...');
        console.log(`[STREAM-TEST] ====== STREAMING TEST COMPLETED SUCCESSFULLY ======`);
      }
    } catch (error) {
      console.error('[STREAM-TEST] Error in streaming speech:', error);
      setStatus('Error generating streaming speech: ' + (error as Error).message);
      setIsLoading(false);
      setIsStreamPlaying(false);
    }
  };

  // Stop streaming playback
  const stopStreamingPlayback = () => {
    if (streamController.current) {
      streamController.current.abort();
    }
    
    if (audioContext.current) {
      audioContext.current.close().then(() => {
        audioContext.current = null;
        audioBufferQueue.current = [];
        isAudioPlaying.current = false;
        setIsStreamPlaying(false);
        setIsLoading(false);
        setStatus('Playback stopped');
      });
    }
  };

  // Download generated audio
  const downloadAudio = () => {
    if (audioBlob) {
      const url = URL.createObjectURL(audioBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'generated-speech.wav';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
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

        {/* TabBar removed - now only streaming is supported */}

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

        {/* Progress bar removed for cleaner UI */}

        {/* Test paragraph button removed */}

        <ButtonGroup>
          {!isStreamPlaying ? (
            <Button
              onClick={speakStreaming}
              disabled={!isModelLoaded || isLoading || !text.trim()}
              isLoading={isLoading && !isStreamPlaying}
            >
              <ButtonContent>
                {(isLoading && !isStreamPlaying) && <Spinner />}
                Speak
              </ButtonContent>
            </Button>
          ) : (
            <Button
              onClick={stopStreamingPlayback}
              isLoading={false}
            >
              <ButtonContent>
                Stop
              </ButtonContent>
            </Button>
          )}

          {audioBlob && (
            <Button onClick={downloadAudio}>
              <ButtonContent>
                Download Audio
              </ButtonContent>
            </Button>
          )}
        </ButtonGroup>

        {(status || isLoading || isStreamPlaying) && (
          <Status>
            {(isLoading || isStreamPlaying) && <Spinner />}
            {status}
            
            {/* Chunk count removed from UI */}
          </Status>
        )}
      </Container>
    </>
  );
}

export default App;