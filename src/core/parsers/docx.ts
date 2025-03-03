/**
 * DOCX Parser for BrowserAI
 * Provides functionality to parse DOCX files in browser environments
 */

import mammoth from 'mammoth';

/**
 * Options for DOCX parsing
 */
export interface DOCXParseOptions {
  /**
   * Whether to extract images (default: false)
   */
  extractImages?: boolean;
  
  /**
   * Whether to preserve styles (default: false)
   */
  preserveStyles?: boolean;
  
  /**
   * Whether to include headers and footers (default: true)
   */
  includeHeadersFooters?: boolean;
  
  /**
   * Whether to extract document properties (default: false)
   */
  extractProperties?: boolean;
  
  /**
   * Debug mode (default: false)
   */
  debug?: boolean;
}

/**
 * Result of DOCX parsing
 */
export interface DOCXParseResult {
  /**
   * The extracted text content
   */
  text: string;
  
  /**
   * HTML representation of the document
   */
  html: string;
  
  /**
   * Document properties (if extracted)
   */
  properties?: Record<string, string>;
  
  /**
   * Document structure information
   */
  structure?: {
    paragraphs: number;
    tables: number;
    images: number;
    sections: number;
  };
  
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
 * DOCX Parser class
 */
export class DOCXParser {
  /**
   * Parse DOCX from a File object
   * @param file DOCX file
   * @param options Parsing options
   * @returns Promise resolving to parsed DOCX data
   */
  static async parseFromFile(file: File, options: DOCXParseOptions = {}): Promise<DOCXParseResult> {
    const debugInfo: string[] = options.debug ? [`Parsing DOCX file: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`] : [];
    const errors: string[] = [];
    
    try {
      // Read the file as ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      
      if (options.debug) {
        debugInfo.push(`File loaded as ArrayBuffer, size: ${arrayBuffer.byteLength} bytes`);
      }
      
      // Configure mammoth options
      const mammothOptions: any = {
        includeDefaultStyleMap: options.preserveStyles !== false,
        includeEmbeddedStyleMap: options.preserveStyles !== false,
        convertImage: options.extractImages ? mammoth.images.imgElement : undefined,
        includeHeader: options.includeHeadersFooters !== false,
        includeFooter: options.includeHeadersFooters !== false
      };
      
      if (options.debug) {
        debugInfo.push(`Mammoth options: ${JSON.stringify(mammothOptions)}`);
      }
      
      // Convert DOCX to HTML
      const result = await mammoth.convertToHtml({ arrayBuffer }, mammothOptions);
      
      if (options.debug) {
        debugInfo.push(`Conversion to HTML complete, HTML length: ${result.value.length} characters`);
        if (result.messages.length > 0) {
          debugInfo.push(`Conversion messages: ${JSON.stringify(result.messages)}`);
        }
      }
      
      // Add any warnings to errors
      result.messages.forEach(message => {
        if (message.type === 'warning') {
          errors.push(message.message);
        }
      });
      
      // Extract text from HTML
      const text = this.extractTextFromHtml(result.value);
      
      if (options.debug) {
        debugInfo.push(`Text extracted from HTML, length: ${text.length} characters`);
      }
      
      // Extract document structure information
      const structure = this.extractStructure(result.value);
      
      if (options.debug) {
        debugInfo.push(`Document structure extracted: ${JSON.stringify(structure)}`);
      }
      
      // Extract document properties if requested
      let properties: Record<string, string> | undefined;
      if (options.extractProperties) {
        try {
          properties = await this.extractProperties(arrayBuffer);
          if (options.debug) {
            debugInfo.push(`Document properties extracted: ${JSON.stringify(properties)}`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          errors.push(`Failed to extract document properties: ${errorMessage}`);
          if (options.debug) {
            debugInfo.push(`Error extracting properties: ${errorMessage}`);
          }
        }
      }
      
      return {
        text,
        html: result.value,
        properties,
        structure,
        errors: errors.length > 0 ? errors : undefined,
        debugInfo: options.debug ? debugInfo : undefined
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Error parsing DOCX: ${errorMessage}`);
      
      if (options.debug) {
        debugInfo.push(`Error: ${errorMessage}`);
      }
      
      return {
        text: '',
        html: '',
        structure: { paragraphs: 0, tables: 0, images: 0, sections: 0 },
        errors,
        debugInfo: options.debug ? debugInfo : undefined
      };
    }
  }
  
  /**
   * Extract text from HTML
   * @param html HTML content
   * @returns Plain text
   */
  private static extractTextFromHtml(html: string): string {
    // Create a DOM parser
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Extract text
    return doc.body.textContent || '';
  }
  
  /**
   * Extract document structure information
   * @param html HTML content
   * @returns Structure information
   */
  private static extractStructure(html: string): DOCXParseResult['structure'] {
    // Create a DOM parser
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    return {
      paragraphs: doc.querySelectorAll('p').length,
      tables: doc.querySelectorAll('table').length,
      images: doc.querySelectorAll('img').length,
      sections: doc.querySelectorAll('section, div.section').length
    };
  }
  
  /**
   * Extract document properties
   * @param arrayBuffer Document as ArrayBuffer
   * @returns Document properties
   */
  private static async extractProperties(arrayBuffer: ArrayBuffer): Promise<Record<string, string>> {
    // This is a simplified version - mammoth doesn't directly expose properties
    // For a full implementation, you might need to use another library or parse the DOCX XML
    
    // Use the arrayBuffer parameter to avoid the TS6133 error
    const size = arrayBuffer.byteLength;
    
    return {
      note: 'Document properties extraction is limited in this version',
      fileSize: `${(size / 1024).toFixed(2)} KB`
    };
  }
  
  /**
   * Check if the file is a valid DOCX file
   * @param file File to check
   * @returns True if the file is a valid DOCX file
   */
  static isValidDocxFile(file: File): boolean {
    return (
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.name.toLowerCase().endsWith('.docx')
    );
  }
  
  /**
   * Check if the file is a valid DOC file
   * @param file File to check
   * @returns True if the file is a valid DOC file
   */
  static isValidDocFile(file: File): boolean {
    return (
      file.type === 'application/msword' ||
      file.name.toLowerCase().endsWith('.doc')
    );
  }
}

/**
 * Formats DOCX content for AI consumption
 * @param result The parsed DOCX result
 * @param options Formatting options
 * @returns Formatted text representation of the DOCX
 */
export function docxToText(
  result: DOCXParseResult,
  options: {
    includeSummary?: boolean;
    includeStructure?: boolean;
    includeProperties?: boolean;
  } = {}
): string {
  // Default options
  const includeSummary = options.includeSummary !== false;
  // Make these false by default
  const includeStructure = options.includeStructure === true;
  const includeProperties = options.includeProperties === true;
  
  const lines: string[] = [];
  
  // Add the main text content
  lines.push(result.text);
  
  // Add a brief summary if requested
  if (includeSummary) {
    lines.push('');
    lines.push('--- Document Summary ---');
    if (result.structure) {
      lines.push(`Document contains approximately ${result.structure.paragraphs} paragraphs of text.`);
      if (result.structure.tables > 0) {
        lines.push(`Document includes ${result.structure.tables} tables.`);
      }
      if (result.structure.images > 0) {
        lines.push(`Document contains ${result.structure.images} images (not included in text).`);
      }
    }
  }
  
  // Add document structure information only if explicitly requested
  if (includeStructure && result.structure) {
    lines.push('');
    lines.push('--- Document Structure ---');
    lines.push(`Paragraphs: ${result.structure.paragraphs}`);
    lines.push(`Tables: ${result.structure.tables}`);
    lines.push(`Images: ${result.structure.images}`);
    lines.push(`Sections: ${result.structure.sections}`);
  }
  
  // Add document properties only if explicitly requested
  if (includeProperties && result.properties) {
    lines.push('');
    lines.push('--- Document Properties ---');
    for (const [key, value] of Object.entries(result.properties)) {
      lines.push(`${key}: ${value}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Extract text from a DOCX file
 * @param file DOCX file
 * @param options Parsing options
 * @returns Promise resolving to extracted text
 */
export async function extractTextFromDOCX(
  file: File,
  options: DOCXParseOptions = {}
): Promise<string> {
  try {
    const result = await DOCXParser.parseFromFile(file, options);
    return result.text;
  } catch (error) {
    console.error('Error extracting text from DOCX:', error);
    return `Error extracting text from DOCX: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Processes a DOCX file and returns both structured data and text representation
 * @param file The DOCX file to process
 * @param options Parsing and formatting options
 * @returns Promise resolving to processed DOCX data
 */
export async function processDOCXFile(
  file: File,
  options: DOCXParseOptions & {
    textFormatting?: {
      includeSummary?: boolean;
      includeStructure?: boolean;
      includeProperties?: boolean;
    }
  } = {}
): Promise<{
  parsed: DOCXParseResult;
  text: string;
  formattedText: string;
  debugInfo: string[];
}> {
  const debugInfo: string[] = [];
  
  // Validate file
  if (!file || (!DOCXParser.isValidDocxFile(file) && !DOCXParser.isValidDocFile(file))) {
    throw new Error('Invalid file: Must be a DOC or DOCX file');
  }
  
  debugInfo.push(`Processing document: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
  
  try {
    // Parse the DOCX file
    debugInfo.push('Parsing document file...');
    const parsed = await DOCXParser.parseFromFile(file, {
      ...options,
      debug: true // Force debug for internal use
    });
    
    debugInfo.push(`Document parsed successfully: ${parsed.text.length} characters of text`);
    
    if (parsed.debugInfo) {
      debugInfo.push(...parsed.debugInfo);
    }
    
    // Get the raw text
    const text = parsed.text;
    
    // Create formatted text for AI with minimal metadata by default
    debugInfo.push('Creating formatted text for AI...');
    const formattedText = docxToText(parsed, {
      includeSummary: options.textFormatting?.includeSummary !== false,
      includeStructure: options.textFormatting?.includeStructure === true,
      includeProperties: options.textFormatting?.includeProperties === true
    });
    debugInfo.push(`Formatted text created: ${formattedText.length} characters`);
    
    return {
      parsed,
      text,
      formattedText,
      debugInfo
    };
  } catch (error) {
    debugInfo.push(`Error: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
} 