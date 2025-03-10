import React, { useState } from 'react';
import PDFDemo from './PDFDemo';
import CSVDemo from './CSVDemo';
import DOCXDemo from './DOCXDemo';
import ImageDemo from './ImageDemo';
import './index.css';

function App() {
  const [activeTab, setActiveTab] = useState<'pdf' | 'csv' | 'docx' | 'image'>('pdf');

  return (
    <div className="App">
      <h1>Document Parser Demo</h1>
      
      <div className="tabs">
        <button 
          className={activeTab === 'pdf' ? 'active' : ''} 
          onClick={() => setActiveTab('pdf')}
        >
          PDF Parser
        </button>
        <button 
          className={activeTab === 'csv' ? 'active' : ''} 
          onClick={() => setActiveTab('csv')}
        >
          CSV Parser
        </button>
        <button 
          className={activeTab === 'docx' ? 'active' : ''} 
          onClick={() => setActiveTab('docx')}
        >
          DOCX Parser
        </button>
        <button 
          className={activeTab === 'image' ? 'active' : ''} 
          onClick={() => setActiveTab('image')}
        >
          Image Parser
        </button>
      </div>
      
      <div className="tab-content">
        {activeTab === 'pdf' && <PDFDemo />}
        {activeTab === 'csv' && <CSVDemo />}
        {activeTab === 'docx' && <DOCXDemo />}
        {activeTab === 'image' && <ImageDemo />}
      </div>
    </div>
  );
}

export default App; 