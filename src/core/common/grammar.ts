export interface GrammarConfig {
  rules: Record<string, string[]>;
  startSymbol: string;
}

export interface SchemaConfig {
  type: string;
  properties?: Record<string, any>;
  enum?: string[];
  items?: SchemaConfig;
}

export class GrammarParser {
  private rules: Record<string, string[]>;
  private startSymbol: string;

  constructor(config: GrammarConfig) {
    this.rules = config.rules;
    this.startSymbol = config.startSymbol;
  }

  static fromJsonSchema(schema: string | object): GrammarParser {
    let parsedSchema: SchemaConfig;
    
    if (typeof schema === 'string') {
      try {
        // Handle Type.Object format
        if (schema.includes('Type.Object')) {
          // Convert Type.Object format to standard JSON schema
          const converted = schema
            .replace(/Type\.Object\(/g, '{"type":"object","properties":')
            .replace(/Type\.String\(\)/g, '{"type":"string"}')
            .replace(/Type\.Number\(\)/g, '{"type":"number"}')
            .replace(/Type\.Boolean\(\)/g, '{"type":"boolean"}')
            .replace(/Type\.Enum\({([\s\S]*?)}\)/g, (match, p1) => {
              const enumValues = p1.split(',')
                .map((line: string) => line.trim())
                .filter((line: string) => line)
                .map((line: string) => {
                  const [, value] = line.split(':').map((s: string) => s.trim().replace(/['"]/g, ''));
                  return value;
                });
              return `{"type":"string","enum":[${enumValues.map((v: string) => `"${v}"`).join(',')}]}`;
            });
          parsedSchema = JSON.parse(converted);
        } else {
          parsedSchema = JSON.parse(schema);
        }
      } catch (e) {
        throw new Error(`Invalid schema format: ${e}`);
      }
    } else {
      parsedSchema = schema as SchemaConfig;
    }

    const rules: Record<string, string[]> = {};
    GrammarParser.convertSchemaToRules(parsedSchema, rules);

    return new GrammarParser({
      rules,
      startSymbol: 'main'
    });
  }

  private static convertSchemaToRules(
    schema: SchemaConfig, 
    rules: Record<string, string[]>, 
    prefix: string = 'main'
  ): void {
    // Handle Type.Object format
    if (typeof schema === 'object' && schema.constructor?.name === 'Object') {
      const properties = schema.properties || {};
      const propEntries = Object.entries(properties);
      
      // Start with opening brace
      rules[prefix] = ['{', 'ws'];
      
      // Add each property
      propEntries.forEach(([key, value], index) => {
        // Add the property key
        rules[prefix].push(`"${key}"`, 'ws', ':', 'ws');
        
        // Handle different types including enums
        if (value.enum) {
          // Create a specific rule for this enum
          const enumPrefix = `${prefix}_${key}_enum`;
          rules[enumPrefix] = value.enum.map((v: string) => `"${v}"`);
          rules[prefix].push(enumPrefix);
        } else if (value.type === 'object' && value.properties) {
          // Handle nested objects
          const objPrefix = `${prefix}_${key}_obj`;
          this.convertSchemaToRules(value, rules, objPrefix);
          rules[prefix].push(objPrefix);
        } else {
          // Handle basic types
          switch (value.type) {
            case 'string':
              rules[prefix].push('basic_string');
              break;
            case 'number':
              rules[prefix].push('basic_number');
              break;
            case 'boolean':
              rules[prefix].push('basic_boolean');
              break;
            case 'array':
              rules[prefix].push('basic_array');
              break;
            default:
              rules[prefix].push('basic_any');
          }
        }
        
        // Add comma if not last property
        if (index < propEntries.length - 1) {
          rules[prefix].push('ws', ',', 'ws');
        }
      });
      
      // Close with ending brace
      rules[prefix].push('ws', '}');
    }
  }

  toGrammarString(): string {
    // Generate all the rules
    const ruleStrings = Object.entries(this.rules).map(([name, parts]) => 
      `${name} ::= ${parts.join(' ')}`
    );

    // Add the basic grammar rules
    return `
${ruleStrings.join('\n')}
basic_string ::= "\\"" ([^"\\\\] | "\\\\" .)* "\\""
basic_number ::= "-"? ("0" | [1-9][0-9]*) ("." [0-9]+)? ([eE][+-]?[0-9]+)?
basic_boolean ::= "true" | "false"
basic_null ::= "null"
basic_array ::= "[" ws (value (ws "," ws value)*)? ws "]"
basic_object ::= "{" ws (basic_string ws ":" ws value (ws "," ws basic_string ws ":" ws value)*)? ws "}"
value ::= basic_string | basic_number | basic_object | basic_array | basic_boolean | basic_null
ws ::= [ \\t\\n]*`.trim();
  }

  static convertTypeObjectToGrammar(schema: any): string {
    try {
      const parser = GrammarParser.fromJsonSchema(schema);
      const grammar = parser.toGrammarString();
      console.log('Generated grammar:', grammar); // For debugging
      return grammar;
    } catch (error) {
      console.error('Error converting schema to grammar:', error);
      throw error;
    }
  }
} 