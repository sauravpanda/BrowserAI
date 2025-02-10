import React, { useState, useEffect } from 'react';
import { Brain, Mic, Loader2 } from 'lucide-react';
import { BrowserAI } from '@browserai/browserai';
import { ChatMessage } from './components/chat-message';
import { motion } from 'framer-motion';
import { InfoBanner } from './components/info-banner';

type Message = {
  isAi: boolean;
  text: string;
  status?: string;
};

function App() {
  const [audioAI] = useState(new BrowserAI());
  const [chatAI] = useState(new BrowserAI());
  const [ttsAI] = useState(new BrowserAI());
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  const handleStartChat = async () => {
    setIsLoading(true);
    try {
      // Load all models in parallel with separate instances
      const loadStart = performance.now();
      
      await Promise.all([
        // Speech recognition model
        audioAI.loadModel('whisper-small-all', {
          device: 'webgpu'
        }),
        // Chat model
        chatAI.loadModel('llama-3.2-1b-instruct'),
        // Text-to-speech model
        ttsAI.loadModel('kokoro-tts')
      ]);

      const loadEnd = performance.now();
      console.log(`Models loaded in ${((loadEnd - loadStart) / 1000).toFixed(2)}s`);

      setIsLoading(false);
      setIsListening(true);
      setMessages([
        { isAi: true, text: "Hello! I'm your AI assistant. I'm listening to you now..." }
      ]);

      // Start recording with audioAI instance
      await audioAI.startRecording();
    } catch (error) {
      console.error('Error loading models:', error);
      setIsLoading(false);
    }
  };

  const handleStopListening = async () => {
    try {
      // Stop recording and get transcription using audioAI
      const audioBlob = await audioAI.stopRecording();
      const transcription = await audioAI.transcribeAudio(audioBlob);
      const transcribedText = (transcription as { text: string })?.text;

      // Add user message
      setMessages(prev => [...prev, { isAi: false, text: transcribedText as string }]);
      
      // Add AI message with thinking status immediately
      setMessages(prev => [...prev, { isAi: true, text: "", status: 'thinking' }]);

      // Generate AI response using chatAI
      const response = await chatAI.generateText(transcribedText, {
        temperature: 0.7,
        maxTokens: 100,
        system_prompt: 'You are a helpful and friendly AI assistant who answers questions in short and concise manner.'
      });

      // Update AI message with response and generating status
      setMessages(prev => prev.map((msg, idx) => 
        idx === prev.length - 1 ? { ...msg, text: response as string, status: 'generating' } : msg
      ));

      // Generate and play speech
      const audioBuffer = await ttsAI.textToSpeech(response as string);
      
      // Update status to speaking before playing
      setMessages(prev => prev.map((msg, idx) => 
        idx === prev.length - 1 ? { ...msg, status: 'speaking' } : msg
      ));

      // Play the audio
      const audioContext = new AudioContext();
      audioContext.decodeAudioData(audioBuffer, (buffer) => {
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start(0);
        
        // Reset status when audio ends
        source.onended = () => {
          setMessages(prev => prev.map((msg, idx) => 
            idx === prev.length - 1 ? { ...msg, status: null } : msg
          ));
        };
      });

      // Continue listening
      await audioAI.startRecording();
    } catch (error) {
      console.error('Error processing speech:', error);
    }
  };

  const generateSpeech = async (text: string): Promise<ArrayBuffer> => {
    try {
      // Your speech generation logic here
      const response = await fetch('/api/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error('Speech generation failed');
      }

      return await response.arrayBuffer();
    } catch (error) {
      console.error('Error generating speech:', error);
      throw error;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Add the InfoBanner component */}
      <InfoBanner />
      
      {/* Existing chat UI */}
      <div className="max-w-4xl mx-auto p-4">
        {/* Header */}
        <header className="fixed top-0 left-0 right-0 bg-black/30 backdrop-blur-xl border-b border-white/10 z-50">
          <div className="container mx-auto px-4 py-4">
          <a 
            href="https://github.com/Cloud-Code-AI/browserai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white hover:text-gray-200 flex items-center justify-center gap-2"
          >
            ⭐ Star BrowserAI on GitHub and help us improve it!
          </a>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <motion.div
                  animate={{ rotate: [0, 360] }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                >
                  <Brain className="h-8 w-8 text-blue-400" />
                </motion.div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 text-transparent bg-clip-text">
                  BrowserAI Demo
                </h1>
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={isListening ? handleStopListening : handleStartChat}
                disabled={isLoading}
                className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-2 rounded-full flex items-center gap-2 transition-all shadow-lg shadow-purple-500/20"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading Models...
                  </>
                ) : isListening ? (
                  <>
                    <Mic className="h-5 w-5 animate-pulse text-red-400" />
                    Stop Listening
                  </>
                ) : (
                  <>
                    <Mic className="h-5 w-5" />
                    Chat with Friend
                  </>
                )}
              </motion.button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-4 pt-24 pb-8">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Welcome Message */}
            {!isLoading && !isListening && messages.length === 0 && (
              <div className="text-center py-20">
                <Brain className="h-16 w-16 mx-auto text-blue-400 mb-4" />
                <h2 className="text-2xl font-bold mb-2">Welcome to BrowserAI Demo</h2>
                <p className="text-gray-400">
                  Experience real-time AI conversation directly in your browser.
                  Click "Chat with Friend" to begin.
                </p>
              </div>
            )}

            {/* Loading State */}
            {isLoading && (
              <div className="text-center py-20">
                <Loader2 className="h-16 w-16 mx-auto animate-spin text-blue-400 mb-4" />
                <h2 className="text-xl font-semibold mb-2">Loading AI Models</h2>
                <p className="text-gray-400">
                  Preparing your AI friend for conversation...
                </p>
              </div>
            )}

            {/* Chat Messages */}
            <div className="space-y-4">
              {messages.map((message, index) => (
                <ChatMessage
                  key={index}
                  isAi={message.isAi}
                  message={message.text}
                  status={message.status}
                />
              ))}
            </div>
          </div>
        </main>

        {/* Transcription Indicator */}
        {isListening && (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-0 left-0 right-0 bg-black/30 backdrop-blur-xl border-t border-white/10"
          >
            <div className="container mx-auto px-4 py-4">
              <div className="flex items-center justify-between max-w-3xl mx-auto">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Mic className="h-6 w-6 text-red-400" />
                    <motion.span
                      animate={{ scale: [1, 1.5, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="absolute top-0 right-0 h-3 w-3 bg-red-500 rounded-full"
                    />
                  </div>
                  <span className="text-sm text-gray-300">Listening to your voice...</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

export default App;