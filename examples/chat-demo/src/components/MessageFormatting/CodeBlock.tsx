import React from 'react';
import styled from '@emotion/styled';

const CodeBlockContainer = styled.div`
  margin: 8px 0;
  position: relative;
  font-family: 'Courier New', Courier, monospace;
`;

const CodeHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: #2d2d2d;
  border: 1px solid #404040;
  border-bottom: none;
  border-radius: 4px 4px 0 0;
`;

const CodeContent = styled.pre`
  margin: 0;
  padding: 16px;
  background: #1a1a1a;
  border: 1px solid #404040;
  border-radius: 0 0 4px 4px;
  overflow-x: auto;
  color: #ffffff;
`;

const CopyButton = styled.button`
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 12px;
  
  &:hover {
    background: #2563eb;
  }
`;

interface CodeBlockProps {
  code: string;
  language?: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ code, language = 'plaintext' }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <CodeBlockContainer>
      <CodeHeader>
        <span>{language}</span>
        <CopyButton onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy'}
        </CopyButton>
      </CodeHeader>
      <CodeContent>{code}</CodeContent>
    </CodeBlockContainer>
  );
};