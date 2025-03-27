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

export interface ContentSection {
    type: 'header' | 'profile' | 'main' | 'navigation' | 'interaction' | 'metadata' | 'other';
    elements: Element[];
    content: string;
    relevanceScore?: number;
    confidence: number;
}

export interface SectionAnalysis {
    sections: ContentSection[];
    summary: string;
    recommendedSections: ContentSection[];
}

// Add new platform-specific patterns
export interface PlatformPatterns {
    selectors: string[];
    classPatterns: RegExp[];
    contentRules: {
        type: ContentSection['type'];
        patterns: string[];
    }[];
}

const PLATFORM_PATTERNS: Record<string, PlatformPatterns> = {
    linkedin: {
        selectors: [
            '[data-test-id]',
            '.profile-section',
            '.feed-shared-update-v2',
            '.scaffold-layout__main'
        ],
        classPatterns: [
            /artdeco-card/,
            /profile-/,
            /feed-shared/,
            /scaffold-layout/
        ],
        contentRules: [
            {
                type: 'profile',
                patterns: ['connections', 'followers', 'experience', 'education', 'skills']
            },
            {
                type: 'interaction',
                patterns: ['connect', 'follow', 'message', 'react', 'comment', 'share']
            }
        ]
    },
    twitter: {
        selectors: [
            '[data-testid]',
            '.tweet',
            '.profile-timeline',
            '[role="article"]'
        ],
        classPatterns: [
            /css-\d+/,
            /tweet-/,
            /timeline-/
        ],
        contentRules: [
            {
                type: 'profile',
                patterns: ['followers', 'following', 'joined', 'tweets']
            },
            {
                type: 'interaction',
                patterns: ['reply', 'retweet', 'like', 'share', 'bookmark']
            }
        ]
    },
    // Generic patterns for any website
    generic: {
        selectors: [
            'main',
            'header',
            'nav',
            'article',
            'aside',
            'section',
            '[role="main"]',
            '[role="navigation"]',
            '[role="complementary"]'
        ],
        classPatterns: [
            /main/i,
            /header/i,
            /content/i,
            /navigation/i
        ],
        contentRules: [
            {
                type: 'main',
                patterns: ['article', 'post', 'content', 'story']
            },
            {
                type: 'navigation',
                patterns: ['menu', 'nav', 'links', 'sidebar']
            }
        ]
    }
};

export class ContentSectionAnalyzer {
    private platform: string = 'generic';
    private patterns: PlatformPatterns;

    constructor() {
        // Start with generic patterns
        this.patterns = PLATFORM_PATTERNS.generic;
    }

    /**
     * Detect the platform and set appropriate patterns
     */
    private detectPlatform(): void {
        const url = window.location.hostname;
        
        if (url.includes('linkedin')) {
            this.platform = 'linkedin';
        } else if (url.includes('twitter')) {
            this.platform = 'twitter';
        } else {
            this.platform = 'generic';
        }
        
        this.patterns = {
            ...PLATFORM_PATTERNS.generic,
            ...PLATFORM_PATTERNS[this.platform]
        };
    }

    analyzeSections(rootElement: Element, task?: string): SectionAnalysis {
        // Detect platform first
        this.detectPlatform();
        
        // Step 1: Initial section grouping
        const sections = this.groupIntoSections(rootElement);
        
        // Step 2: Analyze and score sections
        const analyzedSections = this.analyzeSectionRelevance(sections, task);
        
        // Step 3: Generate summary and recommendations
        return {
            sections: analyzedSections,
            summary: this.generateSectionSummary(analyzedSections),
            recommendedSections: this.getRecommendedSections(analyzedSections)
        };
    }

    private groupIntoSections(rootElement: Element): ContentSection[] {
        const sections: ContentSection[] = [];
        
        // Helper to determine if elements are related
        const areElementsRelated = (el1: Element, el2: Element): boolean => {
            // Check proximity in DOM
            const distance = this.calculateDOMDistance(el1, el2);
            if (distance > 3) return false;
            
            // Check visual proximity (if elements have position data)
            const visuallyClose = this.areElementsVisuallyClose(el1, el2);
            if (!visuallyClose) return false;
            
            // Check semantic relationship
            return this.areElementsSemanticallyRelated(el1, el2);
        };

        // Start with landmark elements
        const landmarks = rootElement.querySelectorAll('main, header, nav, article, aside, section');
        landmarks.forEach(landmark => {
            const type = this.determineSectionType(landmark);
            sections.push({
                type,
                elements: [landmark],
                content: landmark.textContent || '',
                confidence: 0.9
            });
        });

        // Group remaining elements
        const ungroupedElements = Array.from(rootElement.querySelectorAll('*'))
            .filter(el => !this.isElementInSections(el, sections));

        let currentGroup: Element[] = [];
        let currentType: ContentSection['type'] = 'other';

        ungroupedElements.forEach(element => {
            if (currentGroup.length === 0) {
                currentGroup.push(element);
                currentType = this.determineSectionType(element);
            } else {
                const lastElement = currentGroup[currentGroup.length - 1];
                if (areElementsRelated(lastElement, element)) {
                    currentGroup.push(element);
                } else {
                    // Create new section from current group
                    sections.push({
                        type: currentType,
                        elements: [...currentGroup],
                        content: currentGroup.map(el => el.textContent).join(' '),
                        confidence: 0.7
                    });
                    currentGroup = [element];
                    currentType = this.determineSectionType(element);
                }
            }
        });

        // Add any remaining elements
        if (currentGroup.length > 0) {
            sections.push({
                type: currentType,
                elements: currentGroup,
                content: currentGroup.map(el => el.textContent).join(' '),
                confidence: 0.7
            });
        }

        return sections;
    }

    private analyzeSectionRelevance(sections: ContentSection[], task?: string): ContentSection[] {
        return sections.map(section => {
            const relevanceScore = this.calculateRelevanceScore(section, task);
            return {
                ...section,
                relevanceScore
            };
        });
    }

    private calculateRelevanceScore(section: ContentSection, task?: string): number {
        let score = 0;

        // Base score from content quality
        score += this.evaluateContentQuality(section.content);

        // Adjust based on section type
        score += this.getTypeRelevanceScore(section.type);

        // If task is provided, evaluate relevance to task
        if (task) {
            score += this.evaluateTaskRelevance(section.content, task);
        }

        // Normalize score to 0-1 range
        return Math.min(Math.max(score / 3, 0), 1);
    }

    private evaluateContentQuality(content: string): number {
        let score = 0;
        
        // Check content length
        const words = content.split(/\s+/).length;
        if (words > 10 && words < 1000) score += 0.3;
        
        // Check for meaningful content
        if (!/^\s*$/.test(content)) score += 0.2;
        
        // Check for structured content
        if (content.includes('\n')) score += 0.2;
        
        // Check for interactive elements
        if (/button|link|input/i.test(content)) score += 0.3;
        
        return score;
    }

    private getTypeRelevanceScore(type: ContentSection['type']): number {
        const typeScores: Record<ContentSection['type'], number> = {
            header: 0.7,
            profile: 0.8,
            main: 1.0,
            navigation: 0.4,
            interaction: 0.6,
            metadata: 0.3,
            other: 0.2
        };
        
        return typeScores[type];
    }

    private evaluateTaskRelevance(content: string, task: string): number {
        // Convert content and task to lowercase for comparison
        const normalizedContent = content.toLowerCase();
        const normalizedTask = task.toLowerCase();

        // Extract keywords from task
        const taskKeywords = normalizedTask
            .split(/\s+/)
            .filter(word => word.length > 3);

        // Calculate keyword matches
        const matchingKeywords = taskKeywords.filter(keyword => 
            normalizedContent.includes(keyword)
        );

        return matchingKeywords.length / taskKeywords.length;
    }

    private determineSectionType(element: Element): ContentSection['type'] {
        const tagName = element.tagName.toLowerCase();
        const role = element.getAttribute('role');
        const className = element.className;
        const textContent = element.textContent?.toLowerCase() || '';

        // Check platform-specific patterns first
        for (const rule of this.patterns.contentRules) {
            if (rule.patterns.some(pattern => 
                textContent.includes(pattern) || 
                className.toLowerCase().includes(pattern)
            )) {
                return rule.type;
            }
        }

        // Check for platform-specific selectors
        if (this.patterns.selectors.some(selector => element.matches(selector))) {
            // Determine type based on context and content
            return this.inferTypeFromContext(element);
        }

        // Fall back to generic type detection
        if (tagName === 'header' || /header|banner/i.test(className)) {
            return 'header';
        }
        if (/profile|user-info/i.test(className)) {
            return 'profile';
        }
        if (tagName === 'main' || role === 'main' || /main-content/i.test(className)) {
            return 'main';
        }
        if (tagName === 'nav' || role === 'navigation') {
            return 'navigation';
        }
        if (/button|form|input/i.test(tagName)) {
            return 'interaction';
        }
        if (/metadata|info|details/i.test(className)) {
            return 'metadata';
        }
        
        return 'other';
    }

    private inferTypeFromContext(element: Element): ContentSection['type'] {
        const context = {
            hasInteractiveElements: element.querySelectorAll('button, a, input, textarea').length > 0,
            hasImages: element.querySelectorAll('img').length > 0,
            textLength: element.textContent?.length || 0,
            isNearHeader: this.isNearElementType(element, 'header'),
            isNearNav: this.isNearElementType(element, 'nav'),
            hasStructuredData: element.querySelectorAll('ul, ol, table').length > 0
        };

        // Use context to infer section type
        if (context.hasInteractiveElements && context.textLength < 200) {
            return 'interaction';
        }
        if (context.hasImages && context.textLength > 500) {
            return 'main';
        }
        if (context.hasStructuredData && context.isNearNav) {
            return 'navigation';
        }
        if (context.isNearHeader && context.textLength < 300) {
            return 'metadata';
        }

        return 'other';
    }

    private isNearElementType(element: Element, type: string): boolean {
        const distance = 3; // Check 3 elements up and down
        let current = element;
        
        // Check previous siblings
        for (let i = 0; i < distance && current.previousElementSibling; i++) {
            current = current.previousElementSibling;
            if (current.tagName.toLowerCase() === type) return true;
        }
        
        // Check next siblings
        current = element;
        for (let i = 0; i < distance && current.nextElementSibling; i++) {
            current = current.nextElementSibling;
            if (current.tagName.toLowerCase() === type) return true;
        }
        
        return false;
    }

    private calculateDOMDistance(el1: Element, el2: Element): number {
        const path1 = this.getPathToRoot(el1);
        const path2 = this.getPathToRoot(el2);
        
        // Find common ancestor
        let commonAncestorIndex = 0;
        const maxLength = Math.min(path1.length, path2.length);
        
        while (commonAncestorIndex < maxLength && 
               path1[commonAncestorIndex] === path2[commonAncestorIndex]) {
            commonAncestorIndex++;
        }
        
        return (path1.length - commonAncestorIndex) + 
               (path2.length - commonAncestorIndex);
    }

    private getPathToRoot(element: Element): Element[] {
        const path: Element[] = [];
        let current: Element | null = element;
        
        while (current) {
            path.unshift(current);
            current = current.parentElement;
        }
        
        return path;
    }

    private areElementsVisuallyClose(el1: Element, el2: Element): boolean {
        const rect1 = el1.getBoundingClientRect();
        const rect2 = el2.getBoundingClientRect();
        
        // Calculate distance between elements
        const horizontalDistance = Math.abs(rect1.left - rect2.left);
        const verticalDistance = Math.abs(rect1.top - rect2.top);
        
        // Consider elements close if they're within 100px of each other
        return horizontalDistance < 100 && verticalDistance < 100;
    }

    private areElementsSemanticallyRelated(el1: Element, el2: Element): boolean {
        // Add platform-specific class pattern checking
        const matchesPatterns = this.patterns.classPatterns.some(pattern => {
            const el1Match = Array.from(el1.classList).some(c => pattern.test(c));
            const el2Match = Array.from(el2.classList).some(c => pattern.test(c));
            return el1Match && el2Match;
        });

        if (matchesPatterns) return true;

        // Fallback to existing semantic relationship checks
        return this.areElementsSemanticallyRelated(el1, el2);
    }

    private isElementInSections(element: Element, sections: ContentSection[]): boolean {
        return sections.some(section => 
            section.elements.some(el => el.contains(element))
        );
    }

    private generateSectionSummary(sections: ContentSection[]): string {
        const relevantSections = sections
            .filter(s => (s.relevanceScore || 0) > 0.5)
            .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

        return relevantSections
            .map(section => `${section.type.toUpperCase()}: ${
                section.content.substring(0, 100)}${
                section.content.length > 100 ? '...' : ''
            } (Relevance: ${(section.relevanceScore || 0).toFixed(2)})`)
            .join('\n\n');
    }

    private getRecommendedSections(sections: ContentSection[]): ContentSection[] {
        return sections
            .filter(s => (s.relevanceScore || 0) > 0.7)
            .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    }
}