/**
 * PDF Parser for extracting text from PDF files
 * Uses PDF.js library for parsing PDF documents in the browser
 */

// We'll use the PDF.js library which needs to be included in the project
// This interface represents the PDF.js library types we'll use
interface PDFJSStatic {
  getDocument: (source: Uint8Array | { url: string }) => PDFDocumentLoadingTask;
  GlobalWorkerOptions?: {
    workerSrc: string;
  };
  version?: string;
}

interface PDFDocumentLoadingTask {
  promise: Promise<PDFDocumentProxy>;
}

interface PDFDocumentProxy {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PDFPageProxy>;
}

interface PDFPageProxy {
  getTextContent: () => Promise<PDFTextContent>;
}

interface PDFTextContent {
  items: Array<{ str: string }>;
}

// Helper function to get the PDF.js library
function getPdfLib(): PDFJSStatic {
  if (typeof window === 'undefined') {
    throw new Error('PDF.js can only be used in browser environments');
  }
  
  const pdfjsLib = (window as any).pdfjsLib;
  
  if (!pdfjsLib) {
    throw new Error('PDF.js library not found. Make sure to include it in your project.');
  }
  
  console.log('PDF.js library found:', pdfjsLib);
  
  // Ensure worker is set
  if (!pdfjsLib.GlobalWorkerOptions || !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    console.warn('PDF.js worker not set, setting default worker');
    pdfjsLib.GlobalWorkerOptions = pdfjsLib.GlobalWorkerOptions || {};
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  }
  
  return pdfjsLib;
}

/**
 * Options for PDF parsing
 */
export interface PDFParseOptions {
  /**
   * Maximum number of pages to parse (default: all pages)
   */
  maxPages?: number;
  
  /**
   * Whether to include page numbers in the output (default: false)
   */
  includePageNumbers?: boolean;
  
  /**
   * Custom page separator (default: "\n\n")
   */
  pageSeparator?: string;
  
  /**
   * Debug mode (default: false)
   */
  debug?: boolean;
}

/**
 * Result of PDF parsing
 */
export interface PDFParseResult {
  /**
   * The extracted text content
   */
  text: string;
  
  /**
   * Number of pages in the document
   */
  numPages: number;
  
  /**
   * Text content by page
   */
  pages: string[];
  
  /**
   * Any errors encountered during parsing
   */
  errors?: string[];
  
  /**
   * Debug information
   */
  debugInfo?: string[];
}

/**
 * PDF Parser class for extracting text from PDF files
 */
export class PDFParser {
  /**
   * Parse a PDF file from a URL
   * 
   * @param url URL of the PDF file to parse
   * @param options Parsing options
   * @returns Promise resolving to the parsed PDF content
   */
  static async parseFromUrl(url: string, options: PDFParseOptions = {}): Promise<PDFParseResult> {
    const debugInfo: string[] = [];
    if (options.debug) debugInfo.push(`Starting URL parsing: ${url}`);
    console.log(`Starting URL parsing: ${url}`);
    
    try {
      // Get PDF.js library
      const pdfjsLib = getPdfLib();
      if (options.debug) debugInfo.push('PDF.js library found');
      
      // Load the PDF document
      if (options.debug) debugInfo.push('Loading PDF document from URL...');
      console.log('Loading PDF document from URL...');
      
      const loadingTask = pdfjsLib.getDocument({ url });
      const pdf = await loadingTask.promise;
      
      if (options.debug) debugInfo.push(`PDF loaded successfully. Pages: ${pdf.numPages}`);
      console.log(`PDF loaded successfully. Pages: ${pdf.numPages}`);
      
      return this.extractTextFromPdf(pdf, options, debugInfo);
    } catch (error) {
      const errorMessage = (error as Error).message;
      if (options.debug) debugInfo.push(`Error: ${errorMessage}`);
      console.error('PDF parsing error:', error);
      
      return {
        text: '',
        numPages: 0,
        pages: [],
        errors: [errorMessage],
        debugInfo: options.debug ? debugInfo : undefined
      };
    }
  }
  
  /**
   * Parse a PDF file from an ArrayBuffer
   * 
   * @param data ArrayBuffer containing the PDF data
   * @param options Parsing options
   * @returns Promise resolving to the parsed PDF content
   */
  static async parseFromData(data: ArrayBuffer, options: PDFParseOptions = {}): Promise<PDFParseResult> {
    const debugInfo: string[] = [];
    if (options.debug) debugInfo.push(`Starting ArrayBuffer parsing. Size: ${data.byteLength} bytes`);
    console.log(`Starting ArrayBuffer parsing. Size: ${data.byteLength} bytes`);
    
    try {
      // Get PDF.js library
      const pdfjsLib = getPdfLib();
      if (options.debug) debugInfo.push('PDF.js library found');
      
      // Convert ArrayBuffer to Uint8Array
      const uint8Array = new Uint8Array(data);
      if (options.debug) debugInfo.push(`Converted to Uint8Array. Length: ${uint8Array.length}`);
      console.log(`Converted to Uint8Array. Length: ${uint8Array.length}`);
      
      // Load the PDF document
      if (options.debug) debugInfo.push('Loading PDF document from data...');
      console.log('Loading PDF document from data...');
      
      try {
        const loadingTask = pdfjsLib.getDocument(uint8Array);
        console.log('Loading task created:', loadingTask);
        
        const pdf = await loadingTask.promise;
        console.log('PDF loaded successfully:', pdf);
        console.log('Number of pages:', pdf.numPages);
        
        if (options.debug) debugInfo.push(`PDF loaded successfully. Pages: ${pdf.numPages}`);
        
        return this.extractTextFromPdf(pdf, options, debugInfo);
      } catch (loadError) {
        console.error('Error loading PDF:', loadError);
        throw loadError;
      }
    } catch (error) {
      const errorMessage = (error as Error).message;
      if (options.debug) debugInfo.push(`Error: ${errorMessage}`);
      console.error('PDF parsing error:', error);
      
      return {
        text: '',
        numPages: 0,
        pages: [],
        errors: [errorMessage],
        debugInfo: options.debug ? debugInfo : undefined
      };
    }
  }
  
  /**
   * Extract text content from a PDF document
   * 
   * @param pdf PDF document proxy
   * @param options Parsing options
   * @param debugInfo Array to collect debug information
   * @returns Promise resolving to the parsed PDF content
   */
  private static async extractTextFromPdf(
    pdf: PDFDocumentProxy, 
    options: PDFParseOptions,
    debugInfo: string[] = []
  ): Promise<PDFParseResult> {
    const { 
      maxPages = pdf.numPages,
      includePageNumbers = false,
      pageSeparator = '\n\n',
      debug = false
    } = options;
    
    const pageTexts: string[] = [];
    const errors: string[] = [];
    
    // Determine how many pages to process
    const pagesToProcess = Math.min(maxPages, pdf.numPages);
    if (debug) debugInfo.push(`Processing ${pagesToProcess} pages out of ${pdf.numPages} total`);
    console.log(`Processing ${pagesToProcess} pages out of ${pdf.numPages} total`);
    
    // Process each page
    for (let i = 1; i <= pagesToProcess; i++) {
      try {
        if (debug) debugInfo.push(`Processing page ${i}...`);
        console.log(`Processing page ${i}...`);
        
        const page = await pdf.getPage(i);
        console.log(`Page ${i} retrieved`);
        
        const textContent = await page.getTextContent();
        console.log(`Page ${i} text content retrieved`);
        
        let pageText = textContent.items.map(item => item.str).join(' ');
        console.log(`Page ${i} text extracted. Length: ${pageText.length} characters`);
        
        if (debug) debugInfo.push(`Page ${i} text extracted. Length: ${pageText.length} characters`);
        
        // Add page number if requested
        if (includePageNumbers) {
          pageText = `[Page ${i}]\n${pageText}`;
        }
        
        pageTexts.push(pageText);
      } catch (error) {
        const errorMessage = `Error extracting text from page ${i}: ${(error as Error).message}`;
        console.error(errorMessage, error);
        if (debug) debugInfo.push(errorMessage);
        errors.push(errorMessage);
      }
    }
    
    // Combine all page texts
    const fullText = pageTexts.join(pageSeparator);
    if (debug) debugInfo.push(`All pages processed. Total text length: ${fullText.length} characters`);
    console.log(`All pages processed. Total text length: ${fullText.length} characters`);
    
    return {
      text: fullText,
      numPages: pdf.numPages,
      pages: pageTexts,
      errors: errors.length > 0 ? errors : undefined,
      debugInfo: debug ? debugInfo : undefined
    };
  }
  
  /**
   * Helper method to check if PDF.js is available
   * 
   * @returns True if PDF.js is available, false otherwise
   */
  static isPdfJsAvailable(): boolean {
    if (typeof window === 'undefined') return false;
    return typeof (window as any).pdfjsLib !== 'undefined';
  }
  
  /**
   * Helper method to load the PDF.js library dynamically if not already loaded
   * 
   * @param pdfJsPath Path to the PDF.js library
   * @param workerPath Path to the PDF.js worker
   * @returns Promise that resolves when the library is loaded
   */
  static async loadPdfJsLibrary(
    pdfJsPath: string = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
    workerPath: string = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
  ): Promise<void> {
    // Skip if already loaded
    if (this.isPdfJsAvailable()) {
      console.log('PDF.js already loaded, skipping dynamic load');
      return;
    }
    
    console.log('Loading PDF.js dynamically from', pdfJsPath);
    
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = pdfJsPath;
      script.onload = () => {
        console.log('PDF.js script loaded');
        // Set worker path
        const pdfjsLib = (window as any).pdfjsLib;
        if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;
          console.log('PDF.js worker set to', workerPath);
        } else {
          console.warn('Could not set PDF.js worker path');
        }
        resolve();
      };
      script.onerror = (e) => {
        console.error('Failed to load PDF.js:', e);
        reject(new Error(`Failed to load PDF.js from ${pdfJsPath}`));
      };
      document.head.appendChild(script);
    });
  }
}

/**
 * Utility function to extract text from a PDF file
 * 
 * @param source URL or ArrayBuffer of the PDF file
 * @param options Parsing options
 * @returns Promise resolving to the parsed PDF content
 */
export async function extractTextFromPdf(
  source: string | ArrayBuffer,
  options: PDFParseOptions = {}
): Promise<string> {
  console.log('extractTextFromPdf called with source type:', typeof source);
  
  // Enable debug mode if not specified
  const opts = { debug: true, ...options };
  
  let result: PDFParseResult;
  
  if (typeof source === 'string') {
    console.log('Parsing from URL:', source);
    result = await PDFParser.parseFromUrl(source, opts);
  } else {
    console.log('Parsing from ArrayBuffer, size:', source.byteLength);
    result = await PDFParser.parseFromData(source, opts);
  }
  
  console.log('Extraction result:', result);
  return result.text;
}

/**
 * Utility function to extract structured text from a PDF file with page information
 * 
 * @param source URL or ArrayBuffer of the PDF file
 * @param options Parsing options
 * @returns Promise resolving to the parsed PDF content with page information
 */
export async function extractStructuredTextFromPdf(
  source: string | ArrayBuffer,
  options: PDFParseOptions = {}
): Promise<PDFParseResult> {
  console.log('extractStructuredTextFromPdf called with source type:', typeof source);
  
  // Enable debug mode if not specified
  const opts = { debug: true, ...options };
  
  let result: PDFParseResult;
  
  if (typeof source === 'string') {
    console.log('Parsing from URL:', source);
    result = await PDFParser.parseFromUrl(source, opts);
  } else {
    console.log('Parsing from ArrayBuffer, size:', source.byteLength);
    result = await PDFParser.parseFromData(source, opts);
  }
  
  console.log('Structured extraction result:', result);
  return result;
} 