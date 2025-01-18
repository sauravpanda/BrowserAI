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

    /**
     * Updated Regex Patterns:
     * 1) blockMathRegex: Matches $$...$$, \[...\], and \(...\).
     * 2) inlineMathRegex: Matches single-$...$ (still allowed if you want).
     * 3) codeBlockRegex: Loosely matches ```[language?]\n? [any code] ```.
     */

    // Block math can be $$...$$, \[...\], or \(...\)
    const blockMathRegex = /(\${2}([\s\S]+?)\${2})|(\\\[[\s\S]+?\\\])|(\\\([\s\S]+?\\\))/g;
    // Optional inline math with single $...$
    const inlineMathRegex = /\$([\s\S]+?)\$/g;
    // Loosen code block matching: optional language tag + optional newline
    const codeBlockRegex = /```([^`\n]*)\n?([\s\S]*?)```/g;

    while (currentIndex < content.length) {
      // reset lastIndex for each pattern
      blockMathRegex.lastIndex = currentIndex;
      inlineMathRegex.lastIndex = currentIndex;
      codeBlockRegex.lastIndex = currentIndex;

      const blockMatch = blockMathRegex.exec(content);
      const inlineMatch = inlineMathRegex.exec(content);
      const codeMatch = codeBlockRegex.exec(content);

      // Collect whichever matches first in the text
      const matches = [blockMatch, inlineMatch, codeMatch].filter(Boolean) as RegExpExecArray[];
      if (matches.length === 0) {
        // No more matches, push the remaining text
        parts.push(content.slice(currentIndex));
        break;
      }

      // Find the earliest match
      const nextMatch = matches.reduce((closest, match) => {
        return (!closest || match.index < closest.index) ? match : closest;
      });

      // Push any plain text before this match
      if (nextMatch.index > currentIndex) {
        parts.push(content.slice(currentIndex, nextMatch.index));
      }

      if (nextMatch === blockMatch) {
        // We either have $$...$$, $begin:math:display$...$end:math:display$, or $begin:math:text$...$end:math:text$
        // Extract the actual LaTeX content by removing delimiters
        const fullMatch = blockMatch[0];
        let latexContent = '';

        // $$...$$ is captured by group 2,  $begin:math:display$...$end:math:display$ => group 0 minus the slash brackets, etc.
        // We'll do a quick clean-up to remove outer delimiters:
        // e.g. $$E=mc^2$$ => E=mc^2
        //      $begin:math:display$E=mc^2$end:math:display$ => E=mc^2
        //      $begin:math:text$E=mc^2$end:math:text$ => E=mc^2

        // Remove the first/last pair of special chars:
        latexContent = fullMatch
  // Remove leading delimiters
  .replace(
    /^(?:\${2}|\\\$begin:math:display\$|\\\(|\\\[)/,
    ''
  )
  // Remove trailing delimiters
  .replace(
    /(?:\${2}|\\\$end:math:display\$|\\\)|\\\])$/,
    ''
  );

        parts.push(
          <Latex key={key++} formula={latexContent.trim()} display={true} />
        );
        currentIndex = blockMatch.index + fullMatch.length;

      } else if (nextMatch === inlineMatch) {
        // $...$ style inline math
        // The actual content is in inlineMatch[1]
        parts.push(
          <Latex key={key++} formula={inlineMatch[1]} display={false} />
        );
        currentIndex = inlineMatch.index + inlineMatch[0].length;

      } else if (nextMatch === codeMatch) {
        // Triple backtick code block
        const language = codeMatch[1] || 'plaintext';
        const codeContent = codeMatch[2] || '';
        parts.push(
          <CodeBlock
            key={key++}
            code={codeContent}
            language={language.trim() || 'plaintext'}
          />
        );
        currentIndex = codeMatch.index + codeMatch[0].length;
      }
    }

    return parts;
  };

  return <>{processContent()}</>;
};