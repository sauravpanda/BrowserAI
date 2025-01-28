export class HTMLCleaner {
    private tagsToRemove: string[];
    private attributesToRemove: string[];

    /**
     * Creates an instance of HTMLCleaner.
     * @param {string[]} [tagsToRemove] - Array of HTML tags to remove from the content
     * @param {string[]} [attributesToRemove] - Array of HTML attributes to remove from remaining elements
     */
    constructor(tagsToRemove?: string[], attributesToRemove?: string[]) {
        this.tagsToRemove = tagsToRemove || ['script', 'style', 'noscript', 'svg', 'canvas', 'iframe', 'video', 'audio', 'img', 'form', 'input', 'button', 'select', 'textarea', 'nav', 'aside', 'footer', 'header'];
        this.attributesToRemove = attributesToRemove || ['class', 'id', 'style', 'onclick', 'onload', 'onerror', 'onmouseover', 'onmouseout'];
    }

    /**
     * Cleans HTML content by removing specified tags and attributes, returning only text content.
     * @param {string} html - The HTML content to clean
     * @returns {string} Cleaned text content with excess whitespace removed
     */
    clean(html: string): string {
        let tempElement = document.createElement('div');
        tempElement.innerHTML = html;

        this.tagsToRemove.forEach(tag => {
            let elements = tempElement.querySelectorAll(tag);
            elements.forEach(el => el.remove());
        });

        const allElements = tempElement.querySelectorAll('*');
        allElements.forEach(el => {
            this.attributesToRemove.forEach(attr => el.removeAttribute(attr));
        });

        let textContent = tempElement.textContent || "";
        textContent = textContent.replace(/\s+/g, ' ').trim();
        return textContent;
    }

    /**
     * Extracts text content from semantically important HTML elements.
     * @param {string} html - The HTML content to process
     * @returns {string} Concatenated text content from semantic elements with line breaks
     */
    cleanSemantic(html: string): string {
        let tempElement = document.createElement('div');
        tempElement.innerHTML = html;
        let importantText = "";
        const importantTags = ['article', 'main', 'section', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'code', 'pre', 'em', 'strong', 'a'];
        importantTags.forEach(tag => {
            let elements = tempElement.querySelectorAll(tag);
            elements.forEach(el => {
                importantText += (el.textContent || "") + "\n\n";
            });
        });
        importantText = importantText.replace(/\s+/g, ' ').trim();
        return importantText;
    }

    /**
     * Extracts information about interactive elements from HTML content.
     * @param {string} html - The HTML content to process
     * @returns {string} Formatted string containing information about interactive elements
     */
    cleanForInteractive(html: string): string {
        let tempElement = document.createElement('div');
        tempElement.innerHTML = html;
        
        const interactiveElements = new Set([
            'a', 'button', 'input', 'select', 'textarea',
            'details', 'menu', 'menuitem'
        ]);

        const interactiveRoles = new Set([
            'button', 'link', 'checkbox', 'radio',
            'tab', 'menuitem', 'option', 'switch'
        ]);

        let interactiveContent = "";
        
        const processElement = (element: Element) => {
            const tagName = element.tagName.toLowerCase();
            const role = element.getAttribute('role');
            
            if (interactiveElements.has(tagName) || 
                (role && interactiveRoles.has(role))) {
                // Special handling for input elements
                if (tagName === 'input') {
                    const value = (element as HTMLInputElement).value;
                    interactiveContent += `[${tagName}] ${value}\n`;
                } else {
                    interactiveContent += `[${tagName}] ${element.textContent}\n`;
                }
            }
        };

        tempElement.querySelectorAll('*').forEach(processElement);
        return interactiveContent.trim();
    }

    /**
     * Preserves the hierarchical structure of HTML content, focusing on headings and paragraphs.
     * @param {string} html - The HTML content to process
     * @returns {string} Indented text representation of the document's semantic structure
     */
    preserveSemanticHierarchy(html: string): string {
        let tempElement = document.createElement('div');
        tempElement.innerHTML = html;

        const headingLevels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
        let structuredContent = "";
        
        const processNode = (element: Element, depth: number = 0) => {
            const tagName = element.tagName.toLowerCase();
            const indent = '  '.repeat(depth);
            
            if (headingLevels.includes(tagName)) {
                structuredContent += `${indent}${tagName}: ${element.textContent}\n`;
            } else if (tagName === 'p' || tagName === 'article') {
                structuredContent += `${indent}${element.textContent}\n`;
            }
            
            Array.from(element.children).forEach(child => processNode(child, depth + 1));
        };

        processNode(tempElement);
        return structuredContent.trim();
    }

    /**
     * Extracts structured data from HTML content, including schema.org metadata and meta tags.
     * @param {string} html - The HTML content to process
     * @returns {Record<string, string>} Object containing extracted structured data key-value pairs
     */
    extractStructuredData(html: string): Record<string, string> {
        let tempElement = document.createElement('div');
        tempElement.innerHTML = html;
        
        const structuredData: Record<string, string> = {};

        // Extract schema.org metadata
        const schemaElements = tempElement.querySelectorAll('[itemtype]');
        schemaElements.forEach(element => {
            const properties = element.querySelectorAll('[itemprop]');
            properties.forEach(prop => {
                const name = prop.getAttribute('itemprop');
                if (name) {
                    structuredData[name] = prop.textContent || '';
                }
            });
        });

        // Extract meta tags
        const metaTags = tempElement.querySelectorAll('meta[name], meta[property]');
        metaTags.forEach(meta => {
            const name = meta.getAttribute('name') || meta.getAttribute('property');
            const content = meta.getAttribute('content');
            if (name && content) {
                structuredData[name] = content;
            }
        });

        return structuredData;
    }

    // TODO: Add these methods
    /*
    - addCustomCleaningRules()
    - cleanForSummary()
    - handleDynamicContent()
    */
}