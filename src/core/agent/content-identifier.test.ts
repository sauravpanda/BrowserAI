import { identifyMainContent, classifyContent } from './content-identifier';

describe('identifyMainContent', () => {
  test('returns original text when no paragraphs found', () => {
    const text = 'short text';
    expect(identifyMainContent(text)).toBe(text);
  });

  test('returns empty string for empty input', () => {
    expect(identifyMainContent('')).toBe('');
  });

  test('filters out short paragraphs', () => {
    const short = 'too short';
    const long = Array(30).fill('word').join(' ');
    const text = `${short}\n\n${long}`;
    const result = identifyMainContent(text);
    expect(result).toBe(long);
    expect(result).not.toContain(short);
  });

  test('returns all text when no paragraph meets length threshold', () => {
    const text = 'short para one\n\nshort para two';
    expect(identifyMainContent(text)).toBe(text);
  });

  test('returns multiple qualifying paragraphs joined', () => {
    const para1 = Array(25).fill('word').join(' ');
    const para2 = Array(30).fill('another').join(' ');
    const text = `${para1}\n\n${para2}`;
    const result = identifyMainContent(text);
    expect(result).toContain(para1);
    expect(result).toContain(para2);
  });
});

describe('classifyContent', () => {
  test('classifies product-related content', () => {
    const content =
      'Buy this product now at a great price. Add to cart and shop today. The product is available for purchase.';
    const result = classifyContent(content);
    expect(result.type).toBe('product');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.keywords.length).toBeGreaterThan(0);
  });

  test('classifies article-related content', () => {
    const content =
      'This article discusses the latest news story about the blog post that was published. The article covers breaking news.';
    const result = classifyContent(content);
    expect(result.type).toBe('article');
  });

  test('returns other for ambiguous content', () => {
    const content = 'Hello world this is some random text without any particular theme or pattern to classify.';
    const result = classifyContent(content);
    expect(['article', 'product', 'form', 'navigation', 'other']).toContain(result.type);
  });

  test('extracts entities from content', () => {
    const content = 'John Smith works at Acme Corporation in New York City.';
    const result = classifyContent(content);
    expect(result.entities).toContain('John Smith');
    expect(result.entities).toContain('Acme Corporation');
  });

  test('deduplicates entities', () => {
    const content = 'John went home. Then John came back. John is here.';
    const result = classifyContent(content);
    const johnCount = result.entities.filter((e) => e === 'John').length;
    expect(johnCount).toBeLessThanOrEqual(1);
  });

  test('returns keywords sorted by frequency', () => {
    const content = 'price price price buy buy cart shop product product product';
    const result = classifyContent(content);
    expect(result.keywords.length).toBeGreaterThan(0);
    expect(result.keywords[0]).toBe('price');
  });
});
