export class HTMLCleaner {
    private tagsToRemove: string[];
    private attributesToRemove: string[];

    constructor(tagsToRemove?: string[], attributesToRemove?: string[]) {
        this.tagsToRemove = tagsToRemove || ['script', 'style', 'noscript', 'svg', 'canvas', 'iframe', 'video', 'audio', 'img', 'form', 'input', 'button', 'select', 'textarea', 'nav', 'aside', 'footer', 'header'];
        this.attributesToRemove = attributesToRemove || ['class', 'id', 'style', 'onclick', 'onload', 'onerror', 'onmouseover', 'onmouseout'];
    }

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