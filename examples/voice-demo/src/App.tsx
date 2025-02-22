import { useState } from 'react'
import styled from '@emotion/styled'
import { BrowserAI } from '@browserai/browserai'
import './App.css'

const Container = styled.div`
  width: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: #1a1a1a;
  color: #ffffff;
  padding: 2rem;
`

const Title = styled.h1`
  color: #ffffff;
  text-align: center;
  margin-bottom: 30px;
  font-size: 2.5rem;
  background: linear-gradient(120deg, #4CAF50, #2196F3);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
`

const TranscriptionBox = styled.div`
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  width: 100%;
  max-width: 600px;
  min-height: 200px;
  padding: 20px;
  margin: 20px 0;
  background: rgba(42, 42, 42, 0.7);
  backdrop-filter: blur(10px);
`

const ActionButton = styled.button<{ isRecording?: boolean }>`
  background: ${props => props.isRecording ? 
    'linear-gradient(135deg, #ff4444, #cc0000)' : 
    'linear-gradient(135deg, #4CAF50, #45a049)'};
  color: white;
  padding: 14px 28px;
  border-radius: 30px;
  border: none;
  cursor: pointer;
  font-size: 1.1rem;
  transition: all 0.3s ease;

  &:hover {
    opacity: 0.9;
    transform: translateY(-2px);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`

function App() {
  const [isRecording, setIsRecording] = useState(false)
  const [transcription, setTranscription] = useState('')
  const [status, setStatus] = useState('Click Start to begin recording')
  const [audioAI] = useState(new BrowserAI())
  const [isModelLoaded, setIsModelLoaded] = useState(false)

  const loadModel = async () => {
    try {
      setStatus('Loading model...')
      await audioAI.loadModel('whisper-tiny-en')
      setIsModelLoaded(true)
      setStatus('Ready to record')
    } catch (error) {
      console.error('Error loading model:', error)
      setStatus('Error loading model')
    }
  }

  const startRecording = async () => {
    try {
      setIsRecording(true)
      setStatus('Recording...')
      await audioAI.startRecording()
    } catch (error) {
      console.error('Recording error:', error)
      setStatus('Error starting recording')
      setIsRecording(false)
    }
  }

  const stopRecording = async () => {
    try {
      setStatus('Processing...')
      const audioBlob = await audioAI.stopRecording()
      setIsRecording(false)

      if (audioBlob) {
        const result = await audioAI.transcribeAudio(audioBlob)
        const text = (result as { text: string })?.text || ''
        setTranscription(text)
        setStatus('Ready to record')
      }
    } catch (error) {
      console.error('Processing error:', error)
      setStatus('Error processing audio')
      setIsRecording(false)
    }
  }

  return (
    <Container>
      <Title>Voice Demo</Title>
      
      {!isModelLoaded && (
        <ActionButton onClick={loadModel}>
          Load Voice Models
        </ActionButton>
      )}

      {isModelLoaded && (
        <>
          <ActionButton 
            onClick={isRecording ? stopRecording : startRecording}
            isRecording={isRecording}
          >
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </ActionButton>

          <TranscriptionBox>
            <p style={{ color: '#888', marginBottom: '10px' }}>{status}</p>
            {transcription && (
              <p style={{ color: '#fff' }}>{transcription}</p>
            )}
          </TranscriptionBox>
        </>
      )}
    </Container>
  )
}

export default App
