import { GrammarParser } from './grammar';

describe('GrammarParser', () => {
    test('creates parser from JSON schema object', () => {
        const schema = {
            type: 'object',
            properties: {
                name: { type: 'string' },
                age: { type: 'number' }
            }
        };
        const parser = GrammarParser.fromJsonSchema(schema);
        const grammar = parser.toGrammarString();
        expect(grammar).toContain('"name"');
        expect(grammar).toContain('"age"');
        expect(grammar).toContain('basic_string');
        expect(grammar).toContain('basic_number');
    });

    test('creates parser from JSON schema string', () => {
        const schema = JSON.stringify({
            type: 'object',
            properties: {
                active: { type: 'boolean' }
            }
        });
        const parser = GrammarParser.fromJsonSchema(schema);
        const grammar = parser.toGrammarString();
        expect(grammar).toContain('"active"');
        expect(grammar).toContain('basic_boolean');
    });

    test('handles enum types', () => {
        const schema = {
            type: 'object',
            properties: {
                status: { type: 'string', enum: ['active', 'inactive', 'pending'] }
            }
        };
        const parser = GrammarParser.fromJsonSchema(schema);
        const grammar = parser.toGrammarString();
        expect(grammar).toContain('"active"');
        expect(grammar).toContain('"inactive"');
        expect(grammar).toContain('"pending"');
    });

    test('handles nested objects', () => {
        const schema = {
            type: 'object',
            properties: {
                address: {
                    type: 'object',
                    properties: {
                        street: { type: 'string' },
                        zip: { type: 'number' }
                    }
                }
            }
        };
        const parser = GrammarParser.fromJsonSchema(schema);
        const grammar = parser.toGrammarString();
        expect(grammar).toContain('"address"');
        expect(grammar).toContain('"street"');
        expect(grammar).toContain('"zip"');
    });

    test('handles array types', () => {
        const schema = {
            type: 'object',
            properties: {
                tags: { type: 'array' }
            }
        };
        const parser = GrammarParser.fromJsonSchema(schema);
        const grammar = parser.toGrammarString();
        expect(grammar).toContain('basic_array');
    });

    test('includes standard grammar rules', () => {
        const schema = { type: 'object', properties: { x: { type: 'string' } } };
        const parser = GrammarParser.fromJsonSchema(schema);
        const grammar = parser.toGrammarString();
        expect(grammar).toContain('basic_string');
        expect(grammar).toContain('basic_number');
        expect(grammar).toContain('basic_boolean');
        expect(grammar).toContain('basic_null');
        expect(grammar).toContain('basic_array');
        expect(grammar).toContain('basic_object');
        expect(grammar).toContain('value');
        expect(grammar).toContain('ws');
    });

    test('throws on invalid schema string', () => {
        expect(() => GrammarParser.fromJsonSchema('not valid json')).toThrow('Invalid schema format');
    });

    test('convertTypeObjectToGrammar works with object schema', () => {
        const schema = {
            type: 'object',
            properties: {
                name: { type: 'string' }
            }
        };
        const grammar = GrammarParser.convertTypeObjectToGrammar(schema);
        expect(grammar).toContain('"name"');
        expect(grammar).toContain('basic_string');
    });

    test('handles multiple properties with separators', () => {
        const schema = {
            type: 'object',
            properties: {
                a: { type: 'string' },
                b: { type: 'number' },
                c: { type: 'boolean' }
            }
        };
        const parser = GrammarParser.fromJsonSchema(schema);
        const grammar = parser.toGrammarString();
        // Should have commas between properties
        expect(grammar).toContain(',');
    });
});
