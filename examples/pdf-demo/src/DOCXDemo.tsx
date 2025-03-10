import React, { useState, useRef } from 'react';
import { processDOCXFile, DOCXParseResult } from '@browserai/browserai';
import './index.css';

function DOCXDemo() {
  const [docxText, setDocxText] = useState<string>('');
  const [formattedText, setFormattedText] = useState<string>('');
  const [docxStructured, setDocxStructured] = useState<DOCXParseResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [activeView, setActiveView] = useState<'raw' | 'formatted' | 'html'>('raw');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setIsLoading(true);
    setDebugInfo('');
    
    try {
      // Process the DOCX file with a single function call
      const options = {
        extractImages: false,
        preserveStyles: true,
        includeHeadersFooters: true,
        extractProperties: true,
        debug: true,
        textFormatting: {
          includeSummary: false,
          includeStructure: false,
          includeProperties: false
        }
      };
      
      const result = await processDOCXFile(file, options);
      
      // Update state with results
      setDocxText(result.text);
      setFormattedText(result.formattedText);
      setDocxStructured(result.parsed);
      setDebugInfo(result.debugInfo.join('\n'));
      
    } catch (error) {
      console.error('Error processing DOCX:', error);
      setDebugInfo(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files && files.length > 0 && fileInputRef.current) {
      fileInputRef.current.files = files;
      handleFileUpload({ target: { files } } as React.ChangeEvent<HTMLInputElement>);
    }
  };

  const triggerFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="container">
      <h1>DOCX Text Extractor</h1>
      
      <div 
        className="upload-area"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={triggerFileInput}
      >
        <p>Drag & drop a DOC/DOCX file here, or click to select</p>
        <input 
          type="file" 
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          style={{ display: 'none' }}
        />
      </div>
      
      {isLoading && <div className="loading">Processing document...</div>}
      
      {docxStructured && (
        <div className="info-panel">
          <h3>Document Info</h3>
          {docxStructured.structure && (
            <>
              <p>Paragraphs: {docxStructured.structure.paragraphs}</p>
              <p>Tables: {docxStructured.structure.tables}</p>
              <p>Images: {docxStructured.structure.images}</p>
            </>
          )}
          {docxStructured.errors && docxStructured.errors.length > 0 && (
            <div>
              <p>Errors:</p>
              <ul>
                {docxStructured.errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          )}
          
          <div className="view-toggle">
            <button 
              className={activeView === 'raw' ? 'active' : ''} 
              onClick={() => setActiveView('raw')}
            >
              Raw Text
            </button>
            <button 
              className={activeView === 'formatted' ? 'active' : ''} 
              onClick={() => setActiveView('formatted')}
            >
              Formatted Text (for AI)
            </button>
            <button 
              className={activeView === 'html' ? 'active' : ''} 
              onClick={() => setActiveView('html')}
            >
              HTML View
            </button>
          </div>
        </div>
      )}
      
      {docxText && activeView === 'raw' && (
        <div className="text-output">
          <h3>Extracted Text (Raw)</h3>
          <pre>{docxText}</pre>
        </div>
      )}
      
      {formattedText && activeView === 'formatted' && (
        <div className="text-output">
          <h3>Formatted Text (for AI)</h3>
          <pre>{formattedText}</pre>
        </div>
      )}
      
      {docxStructured && activeView === 'html' && (
        <div className="text-output">
          <h3>HTML Representation</h3>
          <div 
            className="html-preview"
            dangerouslySetInnerHTML={{ __html: docxStructured.html }}
          />
        </div>
      )}
      
      {debugInfo && (
        <div className="debug-info">
          <h3>Debug Info</h3>
          <pre>{debugInfo}</pre>
        </div>
      )}
    </div>
  );
}

export default DOCXDemo; 