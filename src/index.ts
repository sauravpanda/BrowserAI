// Import BrowserAI first
import { BrowserAI } from './core/llm';

// Export everything as named exports
export { BrowserAI };
export { MLCEngineWrapper } from './engines/mlc-engine-wrapper';
export { TransformersEngineWrapper } from './engines/transformer-engine-wrapper';
export { default as mlcModels } from './config/models/mlc-models.json';
export { default as transformersModels } from './config/models/transformers-models.json';

export { DatabaseImpl } from './core/database';
export * from './core/agent';

// Export PDF parser
export { 
  PDFParser, 
  extractTextFromPdf, 
  extractStructuredTextFromPdf,
  processPdfFile,
  pdfToText,
  type PDFParseOptions,
  type PDFParseResult
} from './core/parsers/pdf';

// Export CSV parser
export {
  CSVParser,
  extractDataFromCSV,
  extractTextFromCSV,
  processCSVFile,
  csvToText,
  type CSVParseOptions,
  type CSVParseResult
} from './core/parsers/csv';

// Export DOCX parser
export {
  DOCXParser,
  extractTextFromDOCX,
  processDOCXFile,
  docxToText,
  type DOCXParseOptions,
  type DOCXParseResult
} from './core/parsers/docx';

// Export image parser
export {
  ImageParser,
  extractTextFromImage,
  processImageFile,
  imageToText
} from './core/parsers/image';
export type { ImageParseOptions, ImageParseResult } from './core/parsers/image';
