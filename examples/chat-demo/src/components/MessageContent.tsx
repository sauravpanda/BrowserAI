import React, { useState } from 'react';
import { CodeBlock } from './MessageFormatting/CodeBlock';
import { Latex } from './MessageFormatting/Latex';
import MarkdownIt from 'markdown-it';
import styled from '@emotion/styled';

// Initialize markdown-it
const md = new MarkdownIt();

const ThinkingDropdown = styled.div<{ isOpen: boolean }>`
  margin-bottom: 1rem;
  border: 1px solid #404040;
  border-radius: 4px;
  overflow: hidden;

  .thinking-header {
    padding: 0.5rem 1rem;
    background: #2d2d2d;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
    user-select: none;
    
    &:hover {
      background: #363636;
    }
  }

  .thinking-content {
    padding: 1rem;
    border-top: 1px solid #404040;
    background: #1a1a1a;
    color: #a0a0a0;
  }
`;

const MarkdownContent = styled.div`
  line-height: 1.6;
  
  p {
    margin: 1em 0;
    &:first-child {
      margin-top: 0;
    }
    &:last-child {
      margin-bottom: 0;
    }
  }

  h1, h2, h3, h4, h5 {
    margin: 1.5em 0 0.5em 0;
    &:first-child {
      margin-top: 0;
    }
  }

  ul, ol {
    margin: 1em 0;
    padding-left: 2em;
  }

  li {
    margin: 0.5em 0;
  }

  strong {
    font-weight: 600;
  }
`;

const TokenCount = styled.div`
  color: #666;
  font-size: 0.8rem;
  text-align: right;
  margin-top: 0.5rem;
  font-family: monospace;
`;

interface MessageContentProps {
  content: string;
}

// Add interface for parsed content
interface ParsedContent {
  thinking?: string;
  response: string;
  isPartial: boolean;
}

export const MessageContent: React.FC<MessageContentProps> = ({ content }) => {
  const [isThinkingVisible, setIsThinkingVisible] = useState(false);

  // Add simple token counting function
  const countTokens = (text: string): number => {
    // This is a very basic approximation - for more accurate counts,
    // you might want to use a proper tokenizer library
    return Math.ceil(text.length / 4);
  };

  const parseContent = (text: string) => {
    // Check if we have a partial thinking block
    if (text.includes('<think>') && !text.includes('</think>')) {
      const thinkContent = text.split('<think>')[1];
      return {
        thinking: thinkContent.trim(),
        response: '',
        isPartial: true
      };
    }

    // Check for complete thinking block
    const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>\s*([\s\S]*)/);
    if (!thinkMatch) return { response: text };
    
    return {
      thinking: thinkMatch[1].trim(),
      response: thinkMatch[2].trim(),
      isPartial: false
    };
  };

  const renderMarkdown = (text: string) => {
    if (!text) return null;
    return <MarkdownContent dangerouslySetInnerHTML={{ __html: md.render(text) }} />;
  };

  const { thinking, response, isPartial } = parseContent(content);

  return (
    <div>
      {thinking && (
        <ThinkingDropdown isOpen={isThinkingVisible}>
          <div 
            className="thinking-header" 
            onClick={() => setIsThinkingVisible(!isThinkingVisible)}
          >
            <span>💭 AI's Thinking Process {isPartial ? '(in progress...)' : ''}</span>
            <span className="icon">▼</span>
          </div>
          {isThinkingVisible && (
            <div className="thinking-content">
              {renderMarkdown(thinking)}
            </div>
          )}
        </ThinkingDropdown>
      )}
      <div className="response-content">
        {renderMarkdown(response || (!thinking ? content : ''))}
      </div>
      <TokenCount>
        ~{countTokens(content)} tokens
      </TokenCount>
    </div>
  );
};