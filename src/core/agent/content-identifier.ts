export function identifyMainContent(cleanedText: string): string {
    // Split text into paragraphs
    const paragraphs = cleanedText.split('\n\n').filter(p => p.trim());
    
    if (paragraphs.length === 0) return cleanedText;

    // Use heuristics to identify main content
    const mainParagraphs = paragraphs.filter(p => {
        const words = p.split(/\s+/).length;
        return words > 20 && words < 1000; // Reasonable paragraph length
    });

    return mainParagraphs.length > 0 ? mainParagraphs.join('\n\n') : cleanedText;
}

// TODO: Implement these additional content identification functions
/*
- Add semantic structure analysis
- Add relevance scoring
- Add content classification
- Add language detection
- Add summary generation
*/

export interface ContentClassification {
    type: 'article' | 'product' | 'form' | 'navigation' | 'other';
    confidence: number;
    keywords: string[];
    entities: string[];
}

export function classifyContent(content: string): ContentClassification {
    const words = content.toLowerCase().split(/\s+/);
    const wordFreq = new Map<string, number>();
    
    // Calculate word frequencies
    words.forEach(word => {
        if (word.length > 3) { // Skip short words
            wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
        }
    });

    // Extract keywords (words with high frequency)
    const keywords = Array.from(wordFreq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([word]) => word);

    // Simple classification based on content patterns
    const classification = determineContentType(keywords);

    return {
        ...classification,
        keywords,
        entities: extractEntities(content)
    };
}

function determineContentType(keywords: string[]): Pick<ContentClassification, 'type' | 'confidence'> {
    const patterns = {
        article: ['article', 'post', 'blog', 'news', 'story'],
        product: ['price', 'buy', 'cart', 'shop', 'product'],
        form: ['submit', 'input', 'form', 'select', 'checkbox'],
        navigation: ['menu', 'nav', 'link', 'home', 'page']
    };

    const scores = Object.entries(patterns).map(([type, patterns]) => {
        const score = patterns.reduce((acc, pattern) => {
            return acc + (keywords.includes(pattern) ? 1 : 0);
        }, 0) / patterns.length;
        return { type, score };
    });

    const bestMatch = scores.reduce((a, b) => a.score > b.score ? a : b);
    
    return {
        type: bestMatch.score > 0.3 ? bestMatch.type as ContentClassification['type'] : 'other',
        confidence: bestMatch.score
    };
}

function extractEntities(content: string): string[] {
    // Simple named entity recognition
    const entities: string[] = [];
    
    // Find potential proper nouns (words starting with capital letters)
    const words = content.split(/\s+/);
    let currentEntity = '';
    
    words.forEach(word => {
        if (/^[A-Z][a-zA-Z]*$/.test(word)) {
            currentEntity += currentEntity ? ` ${word}` : word;
        } else {
            if (currentEntity) {
                entities.push(currentEntity);
                currentEntity = '';
            }
        }
    });

    // Remove duplicates and return
    return [...new Set(entities)];
}