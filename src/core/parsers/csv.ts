/**
 * CSV Parser for BrowserAI
 * Provides functionality to parse CSV files in browser environments
 */

/**
 * Options for CSV parsing
 */
export interface CSVParseOptions {
  /**
   * Whether to include headers in the output (default: true)
   */
  includeHeaders?: boolean;
  
  /**
   * Custom delimiter (default: ",")
   */
  delimiter?: string;
  
  /**
   * Whether to trim whitespace from values (default: true)
   */
  trimValues?: boolean;
  
  /**
   * Whether to skip empty lines (default: true)
   */
  skipEmptyLines?: boolean;
  
  /**
   * Custom quote character (default: '"')
   */
  quoteChar?: string;
  
  /**
   * Debug mode (default: false)
   */
  debug?: boolean;
}

/**
 * Result of CSV parsing
 */
export interface CSVParseResult {
  /**
   * Headers from the CSV file
   */
  headers: string[];
  
  /**
   * Data rows as arrays of values
   */
  rows: string[][];
  
  /**
   * Data as an array of objects (using headers as keys)
   */
  data: Record<string, string>[];
  
  /**
   * Total number of rows (excluding headers if present)
   */
  rowCount: number;
  
  /**
   * Total number of columns
   */
  columnCount: number;
  
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
 * CSV Parser class
 */
export class CSVParser {
  /**
   * Parse CSV content from a string
   * @param content CSV content as string
   * @param options Parsing options
   * @returns Parsed CSV data
   */
  static parseFromString(content: string, options: CSVParseOptions = {}): CSVParseResult {
    const debugInfo: string[] = options.debug ? ['Parsing CSV from string'] : [];
    const errors: string[] = [];
    
    // Set default options
    const delimiter = options.delimiter || ',';
    const quoteChar = options.quoteChar || '"';
    const includeHeaders = options.includeHeaders !== false;
    const trimValues = options.trimValues !== false;
    const skipEmptyLines = options.skipEmptyLines !== false;
    
    if (options.debug) {
      debugInfo.push(`Options: delimiter="${delimiter}", quoteChar="${quoteChar}", includeHeaders=${includeHeaders}, trimValues=${trimValues}, skipEmptyLines=${skipEmptyLines}`);
    }
    
    try {
      // Split content into lines
      let lines = content.split(/\r?\n/);
      
      if (skipEmptyLines) {
        lines = lines.filter(line => line.trim() !== '');
      }
      
      if (options.debug) {
        debugInfo.push(`Found ${lines.length} lines in CSV`);
      }
      
      if (lines.length === 0) {
        errors.push('CSV content is empty');
        return {
          headers: [],
          rows: [],
          data: [],
          rowCount: 0,
          columnCount: 0,
          errors,
          debugInfo
        };
      }
      
      // Parse lines into rows
      const rows: string[][] = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const row = this.parseLine(line, delimiter, quoteChar, trimValues);
        rows.push(row);
      }
      
      // Extract headers and data
      let headers: string[] = [];
      let data: Record<string, string>[] = [];
      
      if (includeHeaders && rows.length > 0) {
        headers = rows[0];
        const dataRows = rows.slice(1);
        
        // Convert to array of objects
        data = dataRows.map(row => {
          const obj: Record<string, string> = {};
          headers.forEach((header, index) => {
            obj[header] = index < row.length ? row[index] : '';
          });
          return obj;
        });
      } else {
        // No headers, use indices as keys
        data = rows.map(row => {
          const obj: Record<string, string> = {};
          row.forEach((value, index) => {
            obj[`column${index + 1}`] = value;
          });
          return obj;
        });
      }
      
      const columnCount = rows.length > 0 ? rows[0].length : 0;
      const rowCount = includeHeaders && rows.length > 0 ? rows.length - 1 : rows.length;
      
      if (options.debug) {
        debugInfo.push(`Parsed ${rowCount} data rows with ${columnCount} columns`);
      }
      
      return {
        headers,
        rows: includeHeaders && rows.length > 0 ? rows.slice(1) : rows,
        data,
        rowCount,
        columnCount,
        errors: errors.length > 0 ? errors : undefined,
        debugInfo: options.debug ? debugInfo : undefined
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Error parsing CSV: ${errorMessage}`);
      
      if (options.debug) {
        debugInfo.push(`Error: ${errorMessage}`);
      }
      
      return {
        headers: [],
        rows: [],
        data: [],
        rowCount: 0,
        columnCount: 0,
        errors,
        debugInfo: options.debug ? debugInfo : undefined
      };
    }
  }
  
  /**
   * Parse a single CSV line into an array of values
   */
  private static parseLine(line: string, delimiter: string, quoteChar: string, trimValues: boolean): string[] {
    const values: string[] = [];
    let currentValue = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = i < line.length - 1 ? line[i + 1] : '';
      
      if (char === quoteChar) {
        if (inQuotes && nextChar === quoteChar) {
          // Escaped quote
          currentValue += quoteChar;
          i++; // Skip the next quote
        } else {
          // Toggle quote mode
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        // End of value
        values.push(trimValues ? currentValue.trim() : currentValue);
        currentValue = '';
      } else {
        // Add character to current value
        currentValue += char;
      }
    }
    
    // Add the last value
    values.push(trimValues ? currentValue.trim() : currentValue);
    
    return values;
  }
  
  /**
   * Parse CSV from a File object
   * @param file CSV file
   * @param options Parsing options
   * @returns Promise resolving to parsed CSV data
   */
  static async parseFromFile(file: File, options: CSVParseOptions = {}): Promise<CSVParseResult> {
    const debugInfo: string[] = options.debug ? [`Parsing CSV file: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`] : [];
    
    try {
      const text = await file.text();
      
      if (options.debug) {
        debugInfo.push(`File loaded as text, length: ${text.length} characters`);
      }
      
      const result = this.parseFromString(text, options);
      
      if (options.debug && debugInfo.length > 0) {
        result.debugInfo = [...debugInfo, ...(result.debugInfo || [])];
      }
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (options.debug) {
        debugInfo.push(`Error reading file: ${errorMessage}`);
      }
      
      return {
        headers: [],
        rows: [],
        data: [],
        rowCount: 0,
        columnCount: 0,
        errors: [`Error reading CSV file: ${errorMessage}`],
        debugInfo: options.debug ? debugInfo : undefined
      };
    }
  }
}

/**
 * Converts parsed CSV data to a formatted text string
 * @param csvData The parsed CSV data
 * @param options Formatting options
 * @returns Formatted text representation of the CSV data
 */
export function csvToText(
  csvData: CSVParseResult,
  options: {
    includeHeaders?: boolean;
    columnSeparator?: string;
    rowSeparator?: string;
    maxRows?: number;
    maxColumnWidth?: number;
  } = {}
): string {
  // Default options
  const includeHeaders = options.includeHeaders !== false;
  const columnSeparator = options.columnSeparator || ' | ';
  const rowSeparator = options.rowSeparator || '\n';
  const maxRows = options.maxRows || Infinity;
  const maxColumnWidth = options.maxColumnWidth || 50;
  
  // Function to truncate long values
  const truncate = (value: string): string => {
    if (value.length <= maxColumnWidth) return value;
    return value.substring(0, maxColumnWidth - 3) + '...';
  };
  
  const lines: string[] = [];
  
  // Add headers if requested
  if (includeHeaders && csvData.headers.length > 0) {
    lines.push(csvData.headers.map(h => truncate(h)).join(columnSeparator));
    
    // Add separator line
    if (csvData.headers.length > 0) {
      const separatorLine = csvData.headers.map(() => '-'.repeat(10)).join(columnSeparator);
      lines.push(separatorLine);
    }
  }
  
  // Add data rows
  const rowsToInclude = Math.min(csvData.rows.length, maxRows);
  for (let i = 0; i < rowsToInclude; i++) {
    const row = csvData.rows[i];
    lines.push(row.map(cell => truncate(cell)).join(columnSeparator));
  }
  
  // Add indication if rows were truncated
  if (csvData.rows.length > maxRows) {
    lines.push(`... (${csvData.rows.length - maxRows} more rows)`);
  }
  
  // Add summary
  lines.push('');
  lines.push(`CSV Summary: ${csvData.rowCount} rows, ${csvData.columnCount} columns`);
  
  return lines.join(rowSeparator);
}

/**
 * Extract text representation from a CSV file
 * @param source CSV content as string or File
 * @param options Parsing and formatting options
 * @returns Promise resolving to text representation of the CSV
 */
export async function extractTextFromCSV(
  source: string | File,
  options: CSVParseOptions & {
    textFormatting?: {
      includeHeaders?: boolean;
      columnSeparator?: string;
      rowSeparator?: string;
      maxRows?: number;
      maxColumnWidth?: number;
    }
  } = {}
): Promise<string> {
  try {
    let result: CSVParseResult;
    
    if (typeof source === 'string') {
      result = CSVParser.parseFromString(source, options);
    } else {
      result = await CSVParser.parseFromFile(source, options);
    }
    
    // Convert to text
    return csvToText(result, options.textFormatting);
  } catch (error) {
    console.error('Error extracting text from CSV:', error);
    return `Error extracting text from CSV: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Processes a CSV file and returns both structured data and text representation
 * @param file The CSV file to process
 * @param options Parsing and formatting options
 * @returns Promise resolving to processed CSV data
 */
export async function processCSVFile(
  file: File,
  options: CSVParseOptions & {
    textFormatting?: {
      includeHeaders?: boolean;
      columnSeparator?: string;
      rowSeparator?: string;
      maxRows?: number;
      maxColumnWidth?: number;
    }
  } = {}
): Promise<{
  parsed: CSVParseResult;
  text: string;
  debugInfo: string[];
}> {
  const debugInfo: string[] = [];
  
  // Validate file
  if (!file || (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv')) {
    throw new Error('Invalid file: Must be a CSV file');
  }
  
  debugInfo.push(`Processing CSV: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
  
  try {
    // Parse the CSV file
    debugInfo.push('Parsing CSV file...');
    const parsed = await CSVParser.parseFromFile(file, {
      ...options,
      debug: true // Force debug for internal use
    });
    
    debugInfo.push(`CSV parsed successfully: ${parsed.rowCount} rows, ${parsed.columnCount} columns`);
    
    if (parsed.debugInfo) {
      debugInfo.push(...parsed.debugInfo);
    }
    
    // Convert to text
    debugInfo.push('Converting CSV to text format...');
    const text = csvToText(parsed, options.textFormatting);
    debugInfo.push(`Text conversion complete: ${text.length} characters`);
    
    return {
      parsed,
      text,
      debugInfo
    };
  } catch (error) {
    debugInfo.push(`Error: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Extract data from a CSV file as an array of objects
 * @param source CSV content as string or File
 * @param options Parsing options
 * @returns Promise resolving to array of objects
 */
export async function extractDataFromCSV(
  source: string | File,
  options: CSVParseOptions = {}
): Promise<Record<string, string>[]> {
  try {
    let result: CSVParseResult;
    
    if (typeof source === 'string') {
      result = CSVParser.parseFromString(source, options);
    } else {
      result = await CSVParser.parseFromFile(source, options);
    }
    
    return result.data;
  } catch (error) {
    console.error('Error extracting data from CSV:', error);
    return [];
  }
} 