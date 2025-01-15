import React from 'react';
import { CodeBlock } from './MessageFormatting/CodeBlock';
import { Latex } from './MessageFormatting/Latex';

interface MessageContentProps {
  content: string;
}

type ContentPart = string | JSX.Element;

export const MessageContent: React.FC<MessageContentProps> = ({ content }) => {
  const processContent = (): ContentPart[] => {
    const parts: ContentPart[] = [];
    let currentIndex = 0;
    let key = 0;

    // Regular expressions for matching
    const blockMathRegex = /\$\$(.*?)\$\$/gs;
    const inlineMathRegex = /\$(.*?)\$/g;
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;

    while (currentIndex < content.length) {
      blockMathRegex.lastIndex = currentIndex;
      const blockMathMatch = blockMathRegex.exec(content);
      
      inlineMathRegex.lastIndex = currentIndex;
      const inlineMathMatch = inlineMathRegex.exec(content);
      
      codeBlockRegex.lastIndex = currentIndex;
      const codeMatch = codeBlockRegex.exec(content);

      const matches = [
        blockMathMatch,
        inlineMathMatch,
        codeMatch
      ].filter(Boolean) as RegExpExecArray[];

      if (matches.length === 0) {
        parts.push(content.slice(currentIndex));
        break;
      }

      const nextMatch = matches.reduce((closest, match) => {
        return (!closest || match.index < closest.index) ? match : closest;
      });

      if (nextMatch.index > currentIndex) {
        parts.push(content.slice(currentIndex, nextMatch.index));
      }

      if (nextMatch === blockMathMatch) {
        parts.push(
          <Latex key={key++} formula={blockMathMatch[1]} display={true} />
        );
        currentIndex = blockMathMatch.index + blockMathMatch[0].length;
      } else if (nextMatch === inlineMathMatch) {
        parts.push(
          <Latex key={key++} formula={inlineMathMatch[1]} display={false} />
        );
        currentIndex = inlineMathMatch.index + inlineMathMatch[0].length;
      } else if (nextMatch === codeMatch) {
        parts.push(
          <CodeBlock
            key={key++}
            code={codeMatch[2]}
            language={codeMatch[1] || 'plaintext'}
          />
        );
        currentIndex = codeMatch.index + codeMatch[0].length;
      }
    }

    return parts;
  };

  return <>{processContent()}</>;
};