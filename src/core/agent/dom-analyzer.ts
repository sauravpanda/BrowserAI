/**
 * DOM Structure Analyzer
 * A TypeScript library for identifying semantic sections of webpages
 */

// Types for our library
export type SectionType = 
  | 'navigation' 
  | 'header' 
  | 'footer' 
  | 'sidebar' 
  | 'main-content' 
  | 'article'
  | 'comments'
  | 'search'
  | 'social-links'
  | 'advertisement'
  | 'form'
  | 'unknown';

export interface AnalysisResult {
  element: HTMLElement;
  type: SectionType;
  confidence: number;
  highlightColor?: string;
}

export interface AnalyzerOptions {
  highlightColors?: Record<SectionType, string>;
  minimumConfidence?: number;
  enabledAnalyzers?: Array<keyof typeof analyzers>;
}

// Default options
const DEFAULT_OPTIONS: AnalyzerOptions = {
  highlightColors: {
    'navigation': 'rgba(255, 0, 0, 0.2)',
    'header': 'rgba(0, 255, 0, 0.2)',
    'footer': 'rgba(0, 0, 255, 0.2)',
    'sidebar': 'rgba(255, 255, 0, 0.2)',
    'main-content': 'rgba(255, 0, 255, 0.2)',
    'article': 'rgba(0, 255, 255, 0.2)',
    'comments': 'rgba(128, 0, 128, 0.2)',
    'search': 'rgba(255, 165, 0, 0.2)',
    'social-links': 'rgba(0, 128, 128, 0.2)',
    'advertisement': 'rgba(128, 128, 0, 0.2)',
    'form': 'rgba(128, 0, 0, 0.2)',
    'unknown': 'rgba(128, 128, 128, 0.2)'
  },
  minimumConfidence: 0.6,
  enabledAnalyzers: ['semantic', 'classId', 'position', 'content', 'aria']
};

/**
 * Main class for DOM Structure Analysis
 */
export class DOMStructureAnalyzer {
  private options: AnalyzerOptions;
  private results: AnalysisResult[] = [];
  private highlightElements: HTMLElement[] = [];

  constructor(options: Partial<AnalyzerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Analyze the DOM to identify sections
   */
  public analyze(root: HTMLElement = document.body): AnalysisResult[] {
    this.results = [];
    this.removeHighlights();

    // Get all elements that might be structural sections
    const potentialSections = this.getPotentialSections(root);
    
    // Analyze each potential section
    potentialSections.forEach(element => {
      const elementResults: Record<SectionType, number> = {
        'navigation': 0,
        'header': 0,
        'footer': 0,
        'sidebar': 0,
        'main-content': 0,
        'article': 0,
        'comments': 0,
        'search': 0,
        'social-links': 0,
        'advertisement': 0,
        'form': 0,
        'unknown': 0
      };

      // Run enabled analyzers
      this.options.enabledAnalyzers?.forEach(analyzerName => {
        const analyzerResults = analyzers[analyzerName](element);
        
        // Combine results
        Object.keys(analyzerResults).forEach(type => {
          elementResults[type as SectionType] += analyzerResults[type as SectionType];
        });
      });

      // Normalize scores to get confidence levels
      let totalScore = Object.values(elementResults).reduce((sum, score) => sum + score, 0);
      if (totalScore === 0) {
        elementResults.unknown = 1;
        totalScore = 1;
      }

      // Find the section type with highest confidence
      let highestType: SectionType = 'unknown';
      let highestConfidence = 0;

      (Object.keys(elementResults) as SectionType[]).forEach(type => {
        const confidence = elementResults[type] / totalScore;
        if (confidence > highestConfidence) {
          highestConfidence = confidence;
          highestType = type;
        }
      });

      // Add to results if confidence meets minimum threshold
      if (highestConfidence >= (this.options.minimumConfidence || 0.6)) {
        this.results.push({
          element,
          type: highestType,
          confidence: highestConfidence,
          highlightColor: this.options.highlightColors?.[highestType]
        });
      }
    });

    return this.results;
  }

  /**
   * Highlight identified sections on the page
   */
  public highlight(): void {
    this.removeHighlights();

    this.results.forEach(result => {
      const highlightEl = document.createElement('div');
      highlightEl.classList.add('dom-analyzer-highlight');
      
      // Set position and dimensions
      const rect = result.element.getBoundingClientRect();
      const scrollX = window.scrollX || document.documentElement.scrollLeft;
      const scrollY = window.scrollY || document.documentElement.scrollTop;
      
      Object.assign(highlightEl.style, {
        position: 'absolute',
        top: `${rect.top + scrollY}px`,
        left: `${rect.left + scrollX}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        backgroundColor: result.highlightColor || 'rgba(128, 128, 128, 0.2)',
        zIndex: '10000',
        pointerEvents: 'none',
        border: '2px solid rgba(0, 0, 0, 0.5)',
        borderRadius: '4px',
        boxSizing: 'border-box'
      });

      // Add a label
      const label = document.createElement('div');
      Object.assign(label.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        color: 'white',
        padding: '2px 6px',
        fontSize: '12px',
        borderRadius: '2px',
        pointerEvents: 'none'
      });
      label.textContent = `${result.type} (${Math.round(result.confidence * 100)}%)`;
      highlightEl.appendChild(label);

      document.body.appendChild(highlightEl);
      this.highlightElements.push(highlightEl);
    });
  }

  /**
   * Remove all highlights
   */
  public removeHighlights(): void {
    this.highlightElements.forEach(el => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
    this.highlightElements = [];
  }

  /**
   * Get section mapping (for use in other applications)
   */
  public getSectionMap(): Record<SectionType, HTMLElement[]> {
    const map: Record<SectionType, HTMLElement[]> = {
      'navigation': [],
      'header': [],
      'footer': [],
      'sidebar': [],
      'main-content': [],
      'article': [],
      'comments': [],
      'search': [],
      'social-links': [],
      'advertisement': [],
      'form': [],
      'unknown': []
    };

    this.results.forEach(result => {
      map[result.type].push(result.element);
    });

    return map;
  }

  /**
   * Get potential DOM sections for analysis
   */
  private getPotentialSections(root: HTMLElement): HTMLElement[] {
    // First look for semantic elements
    const semanticSelectors = [
      'nav', 'header', 'footer', 'aside', 'main', 'article', 
      'section', 'form', 'div.sidebar', 'div.main', 'div.content',
      'div.navigation', 'div.menu', 'div.header', 'div.footer',
      '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
      '[role="complementary"]', '[role="main"]', '[role="search"]'
    ];

    // Get all matching elements
    const elements = Array.from(
      root.querySelectorAll(semanticSelectors.join(', '))
    ) as HTMLElement[];

    // Include the root if it's a potential section itself
    if (semanticSelectors.some(selector => 
      root.matches(selector) || 
      (root.id && root.id.match(/(nav|header|footer|sidebar|content|main)/i)) ||
      (root.className && root.className.match(/(nav|header|footer|sidebar|content|main)/i))
    )) {
      elements.unshift(root);
    }

    // Filter out elements that are too small or are nested within already detected elements
    return this.filterNestedElements(elements);
  }

  /**
   * Filter out nested elements to prevent duplicate highlighting
   */
  private filterNestedElements(elements: HTMLElement[]): HTMLElement[] {
    // Sort by DOM depth (shallowest first)
    elements.sort((a, b) => {
      let depthA = 0, depthB = 0;
      let node: Node | null = a;
      while (node) { depthA++; node = node.parentNode; }
      node = b;
      while (node) { depthB++; node = node.parentNode; }
      return depthA - depthB;
    });

    // Keep track of which elements to include
    const filtered: HTMLElement[] = [];
    
    elements.forEach(element => {
      // Check if this element is contained within an already included element
      const isNested = filtered.some(parent => parent.contains(element) && parent !== element);
      
      // Only include if not nested and has minimum size
      if (!isNested && this.hasMinimumSize(element)) {
        filtered.push(element);
      }
    });

    return filtered;
  }

  /**
   * Check if an element has minimum size to be considered a section
   */
  private hasMinimumSize(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    return rect.width > 50 && rect.height > 50;
  }
}

/**
 * Individual analyzers that assign scores to different section types
 */
const analyzers = {
  /**
   * Analyzes semantic HTML tags
   */
  semantic(element: HTMLElement): Record<SectionType, number> {
    const scores: Record<SectionType, number> = { } as Record<SectionType, number>;
    Object.keys(DEFAULT_OPTIONS.highlightColors || {}).forEach(key => {
      scores[key as SectionType] = 0;
    });

    const tagName = element.tagName.toLowerCase();
    
    switch (tagName) {
      case 'nav':
        scores.navigation = 10;
        break;
      case 'header':
        scores.header = 10;
        break;
      case 'footer':
        scores.footer = 10;
        break;
      case 'aside':
        scores.sidebar = 10;
        break;
      case 'main':
        scores['main-content'] = 10;
        break;
      case 'article':
        scores.article = 10;
        break;
      case 'form':
        scores.form = 8;
        break;
      case 'section':
        // Need more info to categorize sections
        const sectionHeading = element.querySelector('h1, h2, h3, h4, h5, h6');
        if (sectionHeading) {
          const headingText = sectionHeading.textContent?.toLowerCase() || '';
          if (headingText.includes('comment')) scores.comments = 5;
          else if (headingText.includes('related')) scores['main-content'] = 3;
          else scores.article = 3;
        }
        break;
    }

    return scores;
  },

  /**
   * Analyzes class and ID attributes
   */
  classId(element: HTMLElement): Record<SectionType, number> {
    const scores: Record<SectionType, number> = { } as Record<SectionType, number>;
    Object.keys(DEFAULT_OPTIONS.highlightColors || {}).forEach(key => {
      scores[key as SectionType] = 0;
    });

    const className = element.className.toLowerCase();
    const id = element.id.toLowerCase();
    
    // Navigation indicators
    if (className.match(/nav|menu|navbar|navigation/) || id.match(/nav|menu|navbar|navigation/)) {
      scores.navigation += 5;
    }
    
    // Header indicators
    if (className.match(/header|banner|top/) || id.match(/header|banner|top/)) {
      scores.header += 5;
    }
    
    // Footer indicators
    if (className.match(/footer|bottom/) || id.match(/footer|bottom/)) {
      scores.footer += 5;
    }
    
    // Sidebar indicators
    if (className.match(/sidebar|side|rail|widget-area/) || id.match(/sidebar|side|rail|widget-area/)) {
      scores.sidebar += 5;
    }
    
    // Main content indicators
    if (className.match(/content|main|body|page/) || id.match(/content|main|body|page/)) {
      scores['main-content'] += 5;
    }
    
    // Article indicators
    if (className.match(/article|post|entry/) || id.match(/article|post|entry/)) {
      scores.article += 5;
    }
    
    // Comments indicators
    if (className.match(/comments|discussion|responses/) || id.match(/comments|discussion|responses/)) {
      scores.comments += 5;
    }
    
    // Search indicators
    if (className.match(/search/) || id.match(/search/)) {
      scores.search += 5;
    }
    
    // Social links indicators
    if (className.match(/social|share|follow/) || id.match(/social|share|follow/)) {
      scores['social-links'] += 5;
    }
    
    // Ads indicators
    if (className.match(/ad|ads|advert|banner/) || id.match(/ad|ads|advert|banner/)) {
      scores.advertisement += 5;
    }

    return scores;
  },

  /**
   * Analyzes element position on the page
   */
  position(element: HTMLElement): Record<SectionType, number> {
    const scores: Record<SectionType, number> = { } as Record<SectionType, number>;
    Object.keys(DEFAULT_OPTIONS.highlightColors || {}).forEach(key => {
      scores[key as SectionType] = 0;
    });

    const rect = element.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    const windowWidth = window.innerWidth;
    
    // Top position suggests header or navigation
    if (rect.top < windowHeight * 0.2) {
      scores.header += 3;
      scores.navigation += 2;
    }
    
    // Bottom position suggests footer
    if (rect.bottom > windowHeight * 0.8) {
      scores.footer += 3;
    }
    
    // Left side suggests sidebar
    if (rect.left < windowWidth * 0.2 && rect.width < windowWidth * 0.3) {
      scores.sidebar += 3;
      scores.navigation += 1;
    }
    
    // Right side suggests sidebar
    if (rect.right > windowWidth * 0.8 && rect.width < windowWidth * 0.3) {
      scores.sidebar += 3;
    }
    
    // Central position suggests main content
    if (rect.left > windowWidth * 0.2 && rect.right < windowWidth * 0.8) {
      scores['main-content'] += 3;
      scores.article += 2;
    }

    // Full width at top often indicates navigation or header
    if (rect.width > windowWidth * 0.9 && rect.top < windowHeight * 0.2) {
      scores.navigation += 2;
      scores.header += 2;
    }

    return scores;
  },

  /**
   * Analyzes content characteristics
   */
  content(element: HTMLElement): Record<SectionType, number> {
    const scores: Record<SectionType, number> = { } as Record<SectionType, number>;
    Object.keys(DEFAULT_OPTIONS.highlightColors || {}).forEach(key => {
      scores[key as SectionType] = 0;
    });

    // Count different types of elements
    const links = element.querySelectorAll('a');
    const paragraphs = element.querySelectorAll('p');
    const headings = element.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const images = element.querySelectorAll('img');
    const forms = element.querySelectorAll('form');
    const inputs = element.querySelectorAll('input');
    // const buttons = element.querySelectorAll('button');
    // const lists = element.querySelectorAll('ul, ol');
    
    // Navigation usually has many links, often in lists
    if (links.length > 5 && links.length / element.textContent!.length > 0.1) {
      scores.navigation += 3;
    }
    
    // Main content usually has paragraphs and headings
    if (paragraphs.length > 2 && headings.length >= 1) {
      scores['main-content'] += 3;
      scores.article += 2;
    }
    
    // Articles often have paragraphs, headings, and images
    if (paragraphs.length > 3 && headings.length >= 1 && images.length >= 1) {
      scores.article += 3;
    }
    
    // Search usually has a form with inputs
    if (forms.length >= 1 && inputs.length >= 1) {
      // Specifically look for search input types or placeholder text
      const searchInputs = Array.from(inputs).filter(input => 
        input.getAttribute('type') === 'search' || 
        input.getAttribute('placeholder')?.toLowerCase().includes('search')
      );
      
      if (searchInputs.length > 0) {
        scores.search += 4;
      } else {
        scores.form += 3;
      }
    }
    
    // Comments sections often have repeated similar structures
    const commentPatterns = element.querySelectorAll('.comment, .response, [id^="comment-"]');
    if (commentPatterns.length > 1) {
      scores.comments += 4;
    }
    
    // Social links often have recognizable icons or text
    const socialPatterns = Array.from(links).filter(link => {
      const href = link.getAttribute('href') || '';
      const text = link.textContent?.toLowerCase() || '';
      return href.match(/facebook|twitter|instagram|linkedin|youtube/) || 
             text.match(/facebook|twitter|instagram|linkedin|youtube|share|follow/);
    });
    
    if (socialPatterns.length > 1) {
      scores['social-links'] += 4;
    }
    
    // Sidebar often has widgets and less text
    if (element.querySelectorAll('.widget, aside, [class*="widget"]').length > 0) {
      scores.sidebar += 3;
    }

    return scores;
  },

  /**
   * Analyzes ARIA roles and landmarks
   */
  aria(element: HTMLElement): Record<SectionType, number> {
    const scores: Record<SectionType, number> = { } as Record<SectionType, number>;
    Object.keys(DEFAULT_OPTIONS.highlightColors || {}).forEach(key => {
      scores[key as SectionType] = 0;
    });

    const role = element.getAttribute('role');
    
    if (role) {
      switch (role) {
        case 'navigation':
          scores.navigation = 10;
          break;
        case 'banner':
          scores.header = 10;
          break;
        case 'contentinfo':
          scores.footer = 10;
          break;
        case 'complementary':
          scores.sidebar = 10;
          break;
        case 'main':
          scores['main-content'] = 10;
          break;
        case 'article':
          scores.article = 10;
          break;
        case 'search':
          scores.search = 10;
          break;
        case 'form':
          scores.form = 8;
          break;
      }
    }

    return scores;
  }
};

/**
 * Usage example
 */
export function analyzeAndHighlightPage(): void {
  const analyzer = new DOMStructureAnalyzer();
  analyzer.analyze();
  analyzer.highlight();
  
  console.log('DOM analysis complete');
  console.log('Detected sections:', analyzer.getSectionMap());
} 