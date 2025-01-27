import { HTMLCleaner } from './html-cleaner';

describe('HTMLCleaner', () => {
    let cleaner: HTMLCleaner;

    beforeEach(() => {
        cleaner = new HTMLCleaner();
    });

    test('cleanForInteractive extracts interactive elements', () => {
        const html = `
            <div>
                <button>Click me</button>
                <a href="#">Link</a>
                <input type="text" value="Input">
                <div role="button">Custom Button</div>
            </div>
        `;
        const result = cleaner.cleanForInteractive(html);
        expect(result).toContain('[button] Click me');
        expect(result).toContain('[a] Link');
        expect(result).toContain('[input] Input');
        expect(result).toContain('[div] Custom Button');
    });

    test('preserveSemanticHierarchy maintains heading structure', () => {
        const html = `
            <div>
                <h1>Main Title</h1>
                <h2>Subtitle</h2>
                <p>Paragraph 1</p>
                <h2>Another Section</h2>
                <p>Paragraph 2</p>
            </div>
        `;
        const result = cleaner.preserveSemanticHierarchy(html);
        expect(result).toContain('h1: Main Title');
        expect(result).toContain('h2: Subtitle');
        expect(result).toContain('Paragraph 1');
        expect(result).toContain('h2: Another Section');
        expect(result).toContain('Paragraph 2');
    });

    test('extractStructuredData gets metadata', () => {
        const html = `
            <div itemscope itemtype="http://schema.org/Article">
                <h1 itemprop="name">Article Title</h1>
                <meta name="description" content="Page description">
                <meta property="og:title" content="Social Title">
            </div>
        `;
        const result = cleaner.extractStructuredData(html);
        expect(result).toEqual(expect.objectContaining({
            name: 'Article Title',
            description: 'Page description',
            'og:title': 'Social Title'
        }));
    });
}); 