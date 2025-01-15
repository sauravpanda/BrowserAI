import React, { useEffect, useState } from 'react';
import katex from 'katex';
import styled from '@emotion/styled';

const LatexBlock = styled.div`
  margin: 8px 0;
  overflow-x: auto;
  color: #ffffff;
  
  .katex-display {
    margin: 0;
    padding: 8px 0;
  }
`;

interface LatexProps {
  formula: string;
  display?: boolean;
}

export const Latex: React.FC<LatexProps> = ({ formula, display = false }) => {
  const [html, setHtml] = useState('');

  useEffect(() => {
    try {
      const rendered = katex.renderToString(formula, {
        displayMode: display,
        throwOnError: false
      });
      setHtml(rendered);
    } catch (error) {
      console.error('LaTeX rendering error:', error);
      setHtml(formula);
    }
  }, [formula, display]);

  return (
    <LatexBlock
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};