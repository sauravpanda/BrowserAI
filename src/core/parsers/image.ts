import * as Tesseract from 'tesseract.js';

/**
 * Options for image parsing
 */
export interface ImageParseOptions {
  /**
   * Language for OCR (default: 'eng')
   */
  language?: string;
  
  /**
   * Whether to include confidence scores (default: false)
   */
  includeConfidence?: boolean;
  
  /**
   * Debug mode (default: false)
   */
  debug?: boolean;
}

/**
 * Result of image parsing
 */
export interface ImageParseResult {
  /**
   * The extracted text content
   */
  text: string;
  
  /**
   * Image properties
   */
  properties?: {
    width: number;
    height: number;
    format: string;
    size: number;
  };
  
  /**
   * OCR confidence score (0-100)
   */
  confidence?: number;
  
  /**
   * Any errors encountered during parsing
   */
  errors?: string[];
  
  /**
   * Debug information
   */
  debugInfo?: string[];
  
  /**
   * Whether the image contains meaningful text
   */
  hasText?: boolean;
}

/**
 * Parser for image files (JPEG, PNG)
 */
export class ImageParser {
  /**
   * Parse text from an image file
   */
  static async parseFromFile(file: File, options: ImageParseOptions = {}): Promise<ImageParseResult> {
    const debugInfo: string[] = options.debug ? ['Starting image parsing...'] : [];
    const errors: string[] = [];
    
    try {
      if (options.debug) {
        debugInfo.push(`Processing ${file.name} (${file.type}, ${file.size} bytes)`);
      }
      
      // Create an object URL for the image
      const imageUrl = URL.createObjectURL(file);
      
      if (options.debug) {
        debugInfo.push('Running OCR with Tesseract.js...');
      }
      
      // Run OCR on the image
      const result = await Tesseract.recognize(
        imageUrl,
        options.language || 'eng',
        options.debug ? { logger: m => debugInfo.push(`Tesseract: ${m.status} (${Math.floor(m.progress * 100)}%)`) } : {}
      );
      
      // Clean up the object URL
      URL.revokeObjectURL(imageUrl);
      
      // Extract image properties
      const properties = await this.extractImageProperties(file);
      
      // Clean the extracted text
      const rawText = result.data.text;
      const cleanedText = this.cleanOcrText(rawText);
      const hasText = this.hasActualText(rawText, result.data.confidence);
      
      if (options.debug) {
        debugInfo.push(`OCR completed with confidence: ${result.data.confidence.toFixed(2)}%`);
        debugInfo.push(`Extracted ${rawText.length} characters of raw text`);
        debugInfo.push(`After cleaning: ${cleanedText.length} characters`);
        
        // Add detailed analysis for debugging
        const tokens = cleanedText.split(/\s+/);
        const actualWords = tokens.filter(token => /^[a-zA-Z]{3,}$/.test(token));
        debugInfo.push(`Found ${actualWords.length} actual words out of ${tokens.length} tokens`);
        debugInfo.push(`Word ratio: ${(actualWords.length / Math.max(tokens.length, 1)).toFixed(2)}`);
        debugInfo.push(`Image ${hasText ? 'contains' : 'does not contain'} meaningful text`);
      }
      
      return {
        text: hasText ? cleanedText : '',
        properties,
        confidence: result.data.confidence,
        errors: errors.length > 0 ? errors : undefined,
        debugInfo: debugInfo.length > 0 ? debugInfo : undefined,
        hasText
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Error parsing image: ${errorMessage}`);
      if (options.debug) {
        debugInfo.push(`Error: ${errorMessage}`);
      }
      
      return {
        text: '',
        errors,
        debugInfo: debugInfo.length > 0 ? debugInfo : undefined
      };
    }
  }
  
  /**
   * Extract properties from an image file
   */
  private static async extractImageProperties(file: File): Promise<ImageParseResult['properties']> {
    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({
          width: img.width,
          height: img.height,
          format: file.type.split('/')[1].toUpperCase(),
          size: file.size
        });
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({
          width: 0,
          height: 0,
          format: file.type.split('/')[1].toUpperCase(),
          size: file.size
        });
      };
      
      img.src = objectUrl;
    });
  }
  
  /**
   * Check if a file is a valid image file
   */
  static isValidImageFile(file: File): boolean {
    return file.type === 'image/jpeg' || 
           file.type === 'image/png' || 
           file.type === 'image/jpg';
  }
  
  /**
   * Clean OCR text by removing non-text symbols and noise
   * @param text Raw OCR text
   * @returns Cleaned text
   */
  private static cleanOcrText(text: string): string {
    if (!text || text.trim().length === 0) {
      return '';
    }
    
    // Remove common OCR noise patterns
    let cleaned = text
      // Remove strings of special characters
      .replace(/[^\w\s.,;:!?'"()[\]{}#@%&*+-=/<>|]{2,}/g, ' ')
      // Remove isolated special characters
      .replace(/\s[^\w\s.,;:!?'"()[\]{}#@%&*+-=/<>|]\s/g, ' ')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();
    
    return cleaned;
  }
  
  /**
   * Determines if extracted text is meaningful or just OCR noise
   * @param text The extracted text
   * @param confidence OCR confidence score
   * @returns Whether the text is meaningful
   */
  private static hasActualText(text: string, confidence?: number): boolean {
    // If text is empty after cleaning, it has no meaningful content
    const cleaned = this.cleanOcrText(text);
    if (!cleaned) {
      return false;
    }
    
    // Count actual words (3+ letters) vs. total tokens
    const tokens = cleaned.split(/\s+/);
    const actualWords = tokens.filter(token => /^[a-zA-Z]{3,}$/.test(token));
    
    // Calculate the ratio of actual words to total tokens
    const wordRatio = tokens.length > 0 ? actualWords.length / tokens.length : 0;
    
    // Check for random character distribution (a sign of noise)
    const letters = cleaned.replace(/[^a-zA-Z]/g, '');
    const singleLetterCount = (cleaned.match(/\s[a-zA-Z]\s/g) || []).length;
    const singleLetterRatio = letters.length > 0 ? singleLetterCount / letters.length : 0;
    
    // If confidence is very low, it's likely noise
    if (confidence !== undefined && confidence < 40) {
      return false;
    }
    
    // Check for common OCR noise patterns
    const hasRandomSymbols = /[^\w\s.,;:!?'"()[\]{}#@%&*+-=/<>|]{2,}/.test(text);
    const hasTooManySpecialChars = (text.match(/[^\w\s]/g) || []).length > text.length * 0.3;
    const hasTooManySingleChars = singleLetterRatio > 0.2;
    const hasLowWordRatio = wordRatio < 0.3;
    
    // Your example had lots of single letters and special characters
    if (hasRandomSymbols && hasTooManySpecialChars && (hasTooManySingleChars || hasLowWordRatio)) {
      return false;
    }
    
    // Require a minimum number of actual words
    return actualWords.length >= 3;
  }
}

/**
 * Formats image OCR results for AI consumption
 */
export function imageToText(
  result: ImageParseResult,
  options: {
    includeSummary?: boolean;
  } = {}
): string {
  // Default options
  const includeSummary = options.includeSummary !== false;
  
  const lines: string[] = [];
  
  // If no text was found, return a simple message
  if (!result.text || result.text.trim().length === 0) {
    if (includeSummary) {
      return 'This image does not contain any readable text.';
    }
    return '';
  }
  
  // Add the main text content
  lines.push(result.text);
  
  // Add a brief summary if requested
  if (includeSummary && result.properties) {
    lines.push('');
    lines.push('--- Image Summary ---');
    lines.push(`Image dimensions: ${result.properties.width}x${result.properties.height} pixels`);
    lines.push(`Image format: ${result.properties.format}`);
    lines.push(`Image size: ${Math.round(result.properties.size / 1024)} KB`);
    
    if (result.confidence !== undefined) {
      lines.push(`OCR confidence: ${result.confidence.toFixed(2)}%`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Extract text from an image file
 */
export async function extractTextFromImage(
  file: File,
  options: ImageParseOptions = {}
): Promise<string> {
  const result = await ImageParser.parseFromFile(file, options);
  return result.text;
}

/**
 * Process an image file and return various representations
 */
export async function processImageFile(
  file: File,
  options: ImageParseOptions & {
    textFormatting?: {
      includeSummary?: boolean;
    }
  } = {}
): Promise<{
  parsed: ImageParseResult;
  text: string;
  formattedText: string;
  debugInfo: string[];
}> {
  const debugInfo: string[] = [];
  
  if (options.debug) {
    debugInfo.push(`Processing image file: ${file.name}`);
  }
  
  // Parse the image file
  debugInfo.push('Parsing image file...');
  const parsed = await ImageParser.parseFromFile(file, options);
  
  if (parsed.debugInfo) {
    debugInfo.push(...parsed.debugInfo);
  }
  
  // Extract raw text
  debugInfo.push('Extracting raw text...');
  const text = parsed.text;
  
  // Create formatted text for AI
  debugInfo.push('Creating formatted text for AI...');
  const formattedText = imageToText(parsed, {
    includeSummary: options.textFormatting?.includeSummary !== false
  });
  
  return {
    parsed,
    text,
    formattedText,
    debugInfo
  };
}