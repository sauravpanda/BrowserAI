import React, { useState, useRef } from 'react';
import { processImageFile, ImageParseResult } from '@browserai/browserai';
import './index.css';

function ImageDemo() {
  const [imageText, setImageText] = useState<string>('');
  const [formattedText, setFormattedText] = useState<string>('');
  const [imageData, setImageData] = useState<ImageParseResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [activeView, setActiveView] = useState<'raw' | 'formatted' | 'preview'>('preview');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [hasProcessed, setHasProcessed] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setIsLoading(true);
    setDebugInfo('');
    setHasProcessed(false);
    
    // Create image preview immediately
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
    
    try {
      // Process the image file with a single function call
      const options = {
        language: 'eng',
        includeConfidence: true,
        debug: true,
        textFormatting: {
          includeSummary: true
        }
      };
      
      const result = await processImageFile(file, options);
      
      // Always set the results, even if empty
      setImageText(result.text || '');
      setFormattedText(result.formattedText || '');
      setImageData(result.parsed);
      setDebugInfo(result.debugInfo.join('\n'));
      
      // If no text was found, switch to preview view
      if (!result.text || result.text.trim() === '') {
        setActiveView('preview');
      }
      
      setHasProcessed(true);
    } catch (error) {
      setDebugInfo(`Error processing image: ${error instanceof Error ? error.message : String(error)}`);
      setHasProcessed(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      const fileInput = fileInputRef.current;
      if (fileInput) {
        fileInput.files = event.dataTransfer.files;
        handleFileUpload({ target: { files: event.dataTransfer.files } } as React.ChangeEvent<HTMLInputElement>);
      }
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="parser-demo">
      <h2>Image Text Extraction Demo</h2>
      
      <div 
        className="upload-area" 
        onDragOver={handleDragOver} 
        onDrop={handleDrop} 
        onClick={triggerFileInput}
      >
        <p>Click or drag & drop an image file (JPEG, PNG)</p>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileUpload} 
          accept="image/jpeg,image/png,image/jpg" 
          style={{ display: 'none' }} 
        />
      </div>
      
      {isLoading && <div className="loading">Processing image...</div>}
      
      {imagePreview && hasProcessed && !isLoading && (
        <div className="results-container">
          <div className="view-tabs">
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
              AI-Friendly Text
            </button>
            <button 
              className={activeView === 'preview' ? 'active' : ''} 
              onClick={() => setActiveView('preview')}
            >
              Image Preview
            </button>
          </div>
          
          <div className="view-content">
            {activeView === 'raw' && (
              <pre className="text-content">
                {imageText ? imageText : 'No text detected in this image.'}
              </pre>
            )}
            
            {activeView === 'formatted' && (
              <pre className="text-content">
                {formattedText ? formattedText : 'No text detected in this image.'}
              </pre>
            )}
            
            {activeView === 'preview' && imagePreview && (
              <div className="image-preview">
                <img src={imagePreview} alt="Uploaded image" />
                {(!imageText || imageText.trim() === '') && (
                  <div className="no-text-overlay">
                    <p>No text detected in this image</p>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {debugInfo && (
            <div className="debug-info">
              <h3>Debug Information</h3>
              <pre>{debugInfo}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ImageDemo;
