import React, { useState, useRef } from 'react';
import { processPdfFile, PDFParseResult } from '@browserai/browserai';
import './index.css';

function PDFDemo() {
  const [pdfText, setPdfText] = useState<string>('');
  const [formattedText, setFormattedText] = useState<string>('');
  const [pdfStructured, setPdfStructured] = useState<PDFParseResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [activeView, setActiveView] = useState<'raw' | 'formatted'>('raw');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setIsLoading(true);
    setDebugInfo('');
    
    try {
      // Process the PDF file with a single function call
      const options = {
        includePageNumbers: true,
        debug: true,
        textFormatting: {
          includePageNumbers: true,
          includeSummary: true,
          pagePrefix: '=== Page ',
          pageSuffix: ' ==='
        }
      };

      const fileUrl = URL.createObjectURL(file);
      console.log('fileUrl', fileUrl);
      
      // Reconstruct the File from the Blob URL
      const reconstructFile = async (blobUrl: string, fileName: string, mimeType: string): Promise<File> => {
        const response = await fetch(blobUrl);
        const blob = await response.blob();
        return new File([blob], fileName, { type: mimeType });
      };

      // Example usage
      const reconstructedFile = await reconstructFile(fileUrl, file.name, file.type);
      console.log('Reconstructed file:', reconstructedFile);
      
      const result = await processPdfFile(reconstructedFile, options);
      
      // Update state with results
      setPdfText(result.text);
      setFormattedText(result.formattedText);
      setPdfStructured(result.structured);
      setDebugInfo(result.debugInfo.join('\n'));
      
    } catch (error) {
      console.error('Error processing PDF:', error);
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
      <h1>PDF Text Extractor</h1>
      
      <div 
        className="upload-area"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={triggerFileInput}
      >
        <p>Drag & drop a PDF file here, or click to select</p>
        <input 
          type="file" 
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept=".pdf"
          style={{ display: 'none' }}
        />
      </div>
      
      {isLoading && <div className="loading">Processing PDF...</div>}
      
      {pdfStructured && (
        <div className="info-panel">
          <h3>Document Info</h3>
          <p>Pages: {pdfStructured.numPages}</p>
          {pdfStructured.errors && pdfStructured.errors.length > 0 && (
            <div>
              <p>Errors:</p>
              <ul>
                {pdfStructured.errors.map((error, i) => (
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
          </div>
        </div>
      )}
      
      {pdfText && activeView === 'raw' && (
        <div className="text-output">
          <h3>Extracted Text (Raw)</h3>
          <pre>{pdfText}</pre>
        </div>
      )}
      
      {formattedText && activeView === 'formatted' && (
        <div className="text-output">
          <h3>Formatted Text (for AI)</h3>
          <pre>{formattedText}</pre>
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

export default PDFDemo; 