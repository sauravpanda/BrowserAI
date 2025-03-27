import { useState } from 'react'
import { BrowserAI } from '@browserai/browserai'
import './App.css'
import { sampleSchemas, samplePrompts } from './examples'

function App() {
  const [model, setModel] = useState('llama-3.2-1b-instruct')
  const [prompt, setPrompt] = useState('List 3 favorite colors')
  const [schema, setSchema] = useState(`{
    "type": "object",
    "properties": {
      "colors": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "name": { "type": "string" },
            "hex": { "type": "string" }
          }
        }
      }
    }
  }`)
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)

  const handleGenerate = async () => {
    try {
      setLoading(true)
      const engine = new BrowserAI()
      
      // Load the model
      await engine.loadModel(model)

      // Generate text with JSON schema
      const result = await engine.generateText(prompt, {
        json_schema: JSON.parse(schema),
        temperature: 0.7,
        max_tokens: 500,
        response_format: {
          type: "json_object"
        }
      })

      // Format and display the output
      try {
        const jsonResult = JSON.parse((result as { choices: { message: { content: string } }[] }).choices[0]?.message?.content as string)
        setOutput(JSON.stringify(jsonResult, null, 2))
      } catch (e) {
        setOutput((result as { choices: { message: { content: string } }[] }).choices[0]?.message?.content as string)
      }
    } catch (error) {
      setOutput(`Error: ${error instanceof Error ? error.message : 'An unknown error occurred'}`)
    } finally {
      setLoading(false)
    }
  }

  const examples = [
    { name: 'Colors Example', schema: sampleSchemas.colors, prompt: samplePrompts.colors },
    { name: 'Person Example', schema: sampleSchemas.person, prompt: samplePrompts.person }
  ]

  return (
    <div className="container">
      <h1>Schema-based LLM Generation</h1>
      
      <div className="input-group">
        <label>Model:</label>
        <input 
          type="text" 
          value={model} 
          onChange={(e) => setModel(e.target.value)}
          disabled={loading}
        />
      </div>

      <div className="input-group">
        <label>Prompt:</label>
        <textarea 
          value={prompt} 
          onChange={(e) => setPrompt(e.target.value)}
          disabled={loading}
        />
      </div>

      <div className="input-group">
        <label>Schema (JSON):</label>
        <textarea 
          value={schema} 
          onChange={(e) => setSchema(e.target.value)}
          disabled={loading}
          style={{ height: '200px' }}
        />
      </div>

      <div className="examples">
        <h3>Examples:</h3>
        {examples.map((example, index) => (
          <button
            key={index}
            onClick={() => {
              setSchema(example.schema)
              setPrompt(example.prompt)
            }}
            disabled={loading}
            className="example-button"
          >
            {example.name}
          </button>
        ))}
      </div>

      <button 
        onClick={handleGenerate} 
        disabled={loading}
      >
        {loading ? 'Generating...' : 'Generate'}
      </button>

      <div className="output">
        <h3>Output:</h3>
        <pre>{output}</pre>
      </div>
    </div>
  )
}

export default App