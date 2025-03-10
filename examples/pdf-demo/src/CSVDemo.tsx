import React, { useState, useRef } from 'react';
import { processCSVFile, CSVParseResult } from '@browserai/browserai';
import './index.css';

function CSVDemo() {
  const [csvData, setCsvData] = useState<CSVParseResult | null>(null);
  const [csvText, setCsvText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [activeView, setActiveView] = useState<'table' | 'text'>('table');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setIsLoading(true);
    setDebugInfo('');
    
    try {
      // Process the CSV file with a single function call
      const options = {
        includeHeaders: true,
        trimValues: true,
        skipEmptyLines: true,
        debug: true,
        textFormatting: {
          includeHeaders: true,
          maxRows: 100,
          maxColumnWidth: 30
        }
      };
      
      const result = await processCSVFile(file, options);
      
      // Update state with results
      setCsvData(result.parsed);
      setCsvText(result.text);
      setDebugInfo(result.debugInfo.join('\n'));
      
    } catch (error) {
      console.error('Error processing CSV:', error);
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
      <h1>CSV Data Extractor</h1>
      
      <div 
        className="upload-area"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={triggerFileInput}
      >
        <p>Drag & drop a CSV file here, or click to select</p>
        <input 
          type="file" 
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept=".csv,text/csv"
          style={{ display: 'none' }}
        />
      </div>
      
      {isLoading && <div className="loading">Processing CSV...</div>}
      
      {csvData && (
        <div className="info-panel">
          <h3>CSV Info</h3>
          <p>Rows: {csvData.rowCount}</p>
          <p>Columns: {csvData.columnCount}</p>
          {csvData.errors && csvData.errors.length > 0 && (
            <div>
              <p>Errors:</p>
              <ul>
                {csvData.errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          )}
          
          <div className="view-toggle">
            <button 
              className={activeView === 'table' ? 'active' : ''} 
              onClick={() => setActiveView('table')}
            >
              Table View
            </button>
            <button 
              className={activeView === 'text' ? 'active' : ''} 
              onClick={() => setActiveView('text')}
            >
              Text View (for AI)
            </button>
          </div>
        </div>
      )}
      
      {csvData && activeView === 'table' && (
        <div className="text-output">
          <h3>CSV Data (Table View)</h3>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  {csvData.headers.map((header, i) => (
                    <th key={i}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csvData.rows.slice(0, 10).map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {csvData.rows.length > 10 && (
              <p>Showing 10 of {csvData.rows.length} rows</p>
            )}
          </div>
        </div>
      )}
      
      {csvText && activeView === 'text' && (
        <div className="text-output">
          <h3>CSV Data (Text View for AI)</h3>
          <pre>{csvText}</pre>
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

export default CSVDemo; 