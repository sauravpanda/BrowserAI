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
        
        // Apply deduplication to all methods
        this.applyDeduplicationToAllMethods();
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
        return this.deduplicateFinalOutput(textContent);
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
        return this.deduplicateFinalOutput(importantText);
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
        return this.deduplicateFinalOutput(interactiveContent.trim());
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
        return this.deduplicateFinalOutput(structuredContent.trim());
    }

    /**
     * Creates a concise, structured representation of HTML optimized for LLM understanding.
     * Automatically detects and handles social media content when present.
     * @param {string} html - The HTML content to process
     * @param {Object} options - Configuration options
     * @param {boolean} [options.ignoreLinks=false] - Whether to ignore links in the output
     * @returns {string} Optimized representation for LLM consumption
     */
    cleanForLLM(html: string, options: { ignoreLinks?: boolean } = {}): string {
        let tempElement = document.createElement('div');
        tempElement.innerHTML = html;
        
        // Check if this is likely a social media page
        const socialMediaIndicators = [
            '[data-testid="tweet"]', '.timeline', '.newsfeed', '.feed', 
            '.post', '.status', '[role="article"]', '.comment', '.reply',
            '.profile-info', '.user-profile', '[data-testid="UserProfileHeader"]'
        ];
        
        // If we detect social media elements, use the social media cleaning approach
        for (const selector of socialMediaIndicators) {
            if (tempElement.querySelector(selector)) {
                return this.processSocialMediaContent(tempElement, options);
            }
        }
        
        // Otherwise, use the standard cleaning approach
        return this.processStandardContent(tempElement, options);
    }
    
    /**
     * Processes standard web content for LLM consumption.
     * @private
     * @param {HTMLElement} element - The parsed HTML element
     * @param {Object} options - Configuration options
     * @param {boolean} [options.ignoreLinks=false] - Whether to ignore links in the output
     * @returns {string} Processed content
     */
    private processStandardContent(element: HTMLElement, options: { ignoreLinks?: boolean } = {}): string {
        const ignoreLinks = options.ignoreLinks || false;
        
        // Remove non-essential elements
        this.tagsToRemove.forEach(tag => {
            let elements = element.querySelectorAll(tag);
            elements.forEach(el => el.remove());
        });
        
        // Remove all attributes except href and alt
        element.querySelectorAll('*').forEach(el => {
            Array.from(el.attributes).forEach(attr => {
                if (attr.name !== 'href' && attr.name !== 'alt') {
                    el.removeAttribute(attr.name);
                }
            });
        });
        
        // Process the document to create a structured representation
        let result = '';
        
        // Extract title
        const title = element.querySelector('title');
        if (title && title.textContent) {
            result += `# ${title.textContent.trim()}\n\n`;
        }
        
        // Track processed text to avoid duplicates
        const processedText = new Set<string>();
        
        // Process headings and paragraphs with appropriate formatting
        const processNode = (node: Element) => {
            const tagName = node.tagName.toLowerCase();
            
            // Format headings with markdown-like syntax
            if (/^h[1-6]$/.test(tagName)) {
                const level = parseInt(tagName.substring(1));
                const prefix = '#'.repeat(level);
                const text = node.textContent?.trim();
                if (text && !processedText.has(text)) {
                    result += `${prefix} ${text}\n\n`;
                    processedText.add(text);
                }
            } 
            // Handle paragraphs and list items
            else if (tagName === 'p') {
                const text = node.textContent?.trim();
                if (text && !processedText.has(text) && text.length > 1) {
                    result += `${text}\n\n`;
                    processedText.add(text);
                }
            }
            else if (tagName === 'li') {
                const text = node.textContent?.trim();
                if (text && !processedText.has(text) && text.length > 1) {
                    // Apply deduplication to list items
                    const dedupedText = this.deduplicateRepeatedText(text);
                    result += `• ${dedupedText}\n`;
                    processedText.add(text);
                }
            }
            // Handle spans - add newline after span blocks
            else if (tagName === 'span') {
                const text = node.textContent?.trim();
                if (text && !processedText.has(text) && text.length > 1) {
                    result += `${text}\n`;
                    processedText.add(text);
                }
            }
            // Handle divs - add newline after div blocks
            else if (tagName === 'div') {
                const text = node.textContent?.trim();
                // Only process divs directly (not their children) if they have no child elements
                // or only have text nodes as children
                if (text && !processedText.has(text) && text.length > 1 && 
                    (node.children.length === 0 || 
                     Array.from(node.childNodes).every(child => 
                        child.nodeType === Node.TEXT_NODE || 
                        (child.nodeType === Node.ELEMENT_NODE && 
                         (child as Element).tagName.toLowerCase() === 'span')))) {
                    // Apply deduplication to div content
                    const dedupedText = this.deduplicateRepeatedText(text);
                    result += `${dedupedText}\n\n`;
                    processedText.add(text);
                    // Skip processing children since we've already included their text
                    return;
                }
            }
            // Handle links
            else if (tagName === 'a' && node.getAttribute('href') && !ignoreLinks) {
                const text = node.textContent?.trim();
                const href = node.getAttribute('href');
                if (text && !processedText.has(`${text}${href}`) && text.length > 1) {
                    // Apply deduplication to link text
                    const dedupedText = this.deduplicateRepeatedText(text);
                    result += `[${dedupedText}](${href}) `;
                    processedText.add(`${text}${href}`);
                    return; // Don't process children separately for links
                }
            }
            else if (tagName === 'a' && ignoreLinks) {
                // If ignoring links, just process the text content
                const text = node.textContent?.trim();
                if (text && !processedText.has(text) && text.length > 1) {
                    // Apply deduplication to link text
                    const dedupedText = this.deduplicateRepeatedText(text);
                    result += `${dedupedText} `;
                    processedText.add(text);
                    return; // Don't process children separately
                }
            }
            
            // Process children
            Array.from(node.children).forEach(child => processNode(child));
        };
        
        // Process main content areas first if they exist
        const mainContent = element.querySelector('main, article, #content, .content');
        if (mainContent) {
            processNode(mainContent);
        } else {
            // If no main content container is found, process the body
            const body = element.querySelector('body');
            if (body) {
                processNode(body);
            }
        }
        
        // Clean up the result by removing duplicate newlines and extra spaces
        return result.trim()
            .replace(/\n{3,}/g, '\n\n')  // Normalize spacing
            .replace(/\s{2,}/g, ' ')     // Replace multiple spaces with a single space
            .replace(/\n +/g, '\n');     // Remove spaces at the beginning of lines
    }
    
    /**
     * Processes social media content for LLM consumption.
     * @private
     * @param {HTMLElement} element - The parsed HTML element
     * @param {Object} options - Configuration options
     * @param {boolean} [options.ignoreLinks=false] - Whether to ignore links in the output
     * @returns {string} Processed social media content
     */
    private processSocialMediaContent(element: HTMLElement, options: { ignoreLinks?: boolean } = {}): string {
        const ignoreLinks = options.ignoreLinks || false;
        let result = '';
        
        // Common selectors for social media elements
        const postSelectors = [
            'article', '.post', '[data-testid="tweet"]', '.status', 
            '.feed-item', '.timeline-item', '[role="article"]', '.fie-impression-container'
        ];
        
        const userSelectors = [
            '.user', '.profile', '.author', '[data-testid="User-Name"]',
            '.username', '.account', '.user-info', '.pv-text-details__left-panel'
        ];
        
        // Add comment selectors
        const commentSelectors = [
            '.comment', '.reply', '[data-testid="reply"]', '.comments-item',
            '.comment-container', '.tweet-reply', '.comment-thread-item'
        ];
        
        // Define LinkedIn experience selectors
        const linkedinExperienceSelectors = [
            '.pv-entity__position-group',
            '.experience-item',
            '.pv-profile-section__list-item',
            '.pv-entity__summary-info',
            '.artdeco-list__item'
        ];
        
        // Define LinkedIn education selectors
        const linkedinEducationSelectors = [
            '.pv-education-entity',
            '.pv-profile-section__list-item',
            '.education-item',
            '.pv-entity__summary-info'
        ];
        
        // Track processed text to avoid duplicates
        const processedText = new Set<string>();
        
        // Process links in text if needed
        const processText = (text: string): string => {
            if (!text) return '';
            
            // If ignoring links, remove URL patterns from text
            if (ignoreLinks) {
                return text.replace(/https?:\/\/\S+/g, '[URL]');
            }
            return text;
        };
        
        // Helper function to process spans and add newlines
        const processSpans = (container: Element): string => {
            let spanText = '';
            const spans = container.querySelectorAll('span');
            
            if (spans.length > 0) {
                spans.forEach(span => {
                    const text = span.textContent?.trim();
                    if (text && !processedText.has(text) && text.length > 1) {
                        // Apply deduplication to span text
                        const dedupedText = this.deduplicateRepeatedText(processText(text));
                        spanText += `${dedupedText}\n`;
                        processedText.add(text);
                    }
                });
            }
            
            return spanText;
        };
        
        // Check if this is a LinkedIn profile page
        const isLinkedInProfile = element.querySelector('.pv-top-card, [data-test-id="profile-topcard"]');
        
        if (isLinkedInProfile) {
            result += "# LINKEDIN PROFILE\n\n";
            
            // Extract profile name
            const profileName = element.querySelector('.pv-text-details__left-panel h1, .text-heading-xlarge');
            if (profileName) {
                const nameText = profileName.textContent?.trim();
                if (nameText && !processedText.has(nameText)) {
                    result += `**Name:** ${processText(nameText)}\n`;
                    processedText.add(nameText);
                }
            }
            
            // Extract headline
            const headline = element.querySelector('.pv-text-details__left-panel .text-body-medium, .text-body-large');
            if (headline) {
                const headlineText = headline.textContent?.trim();
                if (headlineText && !processedText.has(headlineText)) {
                    result += `**Headline:** ${processText(headlineText)}\n`;
                    processedText.add(headlineText);
                }
            }
            
            // Extract location
            const location = element.querySelector('.pv-text-details__left-panel .text-body-small:not(.inline), [data-test-id="profile-location"]');
            if (location) {
                const locationText = location.textContent?.trim();
                if (locationText && !processedText.has(locationText)) {
                    result += `**Location:** ${processText(locationText)}\n`;
                    processedText.add(locationText);
                }
            }
            
            // Extract about section
            const about = element.querySelector('.pv-shared-text-with-see-more, [data-test-id="about-section"], #about');
            if (about) {
                const aboutText = about.textContent?.trim();
                if (aboutText && !processedText.has(aboutText)) {
                    result += `\n## About\n${processText(aboutText)}\n`;
                    processedText.add(aboutText);
                }
            }
            
            // Extract experience section
            const experienceSection = element.querySelector('#experience-section, [data-test-id="experience-section"]');
            if (experienceSection) {
                result += "\n## Experience\n";
                
                const experiences = experienceSection.querySelectorAll(linkedinExperienceSelectors.join(', '));
                experiences.forEach((exp, index) => {
                    const title = exp.querySelector('.t-16, .t-bold, .pv-entity__summary-info-title');
                    const company = exp.querySelector('.pv-entity__secondary-title, .t-14.t-normal');
                    const date = exp.querySelector('.pv-entity__date-range, .t-14.t-normal.t-black--light');
                    const description = exp.querySelector('.pv-entity__description');
                    
                    if (title) {
                        const titleText = title.textContent?.trim();
                        if (titleText && !processedText.has(`exp-${index}-${titleText}`)) {
                            result += `\n### ${processText(titleText)}\n`;
                            processedText.add(`exp-${index}-${titleText}`);
                        }
                    }
                    
                    if (company) {
                        const companyText = company.textContent?.trim();
                        if (companyText && !processedText.has(`exp-${index}-${companyText}`)) {
                            result += `**Company:** ${processText(companyText)}\n`;
                            processedText.add(`exp-${index}-${companyText}`);
                        }
                    }
                    
                    if (date) {
                        const dateText = date.textContent?.trim();
                        if (dateText && !processedText.has(`exp-${index}-${dateText}`)) {
                            result += `**Duration:** ${processText(dateText)}\n`;
                            processedText.add(`exp-${index}-${dateText}`);
                        }
                    }
                    
                    if (description) {
                        const descText = description.textContent?.trim();
                        if (descText && !processedText.has(`exp-${index}-${descText}`)) {
                            result += `${processText(descText)}\n`;
                            processedText.add(`exp-${index}-${descText}`);
                        }
                    }
                });
            }
            
            // Extract education section
            const educationSection = element.querySelector('#education-section, [data-test-id="education-section"]');
            if (educationSection) {
                result += "\n## Education\n";
                
                const educations = educationSection.querySelectorAll(linkedinEducationSelectors.join(', '));
                educations.forEach((edu, index) => {
                    const school = edu.querySelector('.pv-entity__school-name, .t-16.t-bold');
                    const degree = edu.querySelector('.pv-entity__degree-name, .pv-entity__secondary-title');
                    const date = edu.querySelector('.pv-entity__dates, .t-14.t-normal.t-black--light');
                    
                    if (school) {
                        const schoolText = school.textContent?.trim();
                        if (schoolText && !processedText.has(`edu-${index}-${schoolText}`)) {
                            result += `\n### ${processText(schoolText)}\n`;
                            processedText.add(`edu-${index}-${schoolText}`);
                        }
                    }
                    
                    if (degree) {
                        const degreeText = degree.textContent?.trim();
                        if (degreeText && !processedText.has(`edu-${index}-${degreeText}`)) {
                            result += `**Degree:** ${processText(degreeText)}\n`;
                            processedText.add(`edu-${index}-${degreeText}`);
                        }
                    }
                    
                    if (date) {
                        const dateText = date.textContent?.trim();
                        if (dateText && !processedText.has(`edu-${index}-${dateText}`)) {
                            result += `**Years:** ${processText(dateText)}\n`;
                            processedText.add(`edu-${index}-${dateText}`);
                        }
                    }
                });
            }
            
            // Extract skills section
            const skillsSection = element.querySelector('#skills-section, [data-test-id="skills-section"]');
            if (skillsSection) {
                result += "\n## Skills\n";
                
                const skills = skillsSection.querySelectorAll('.pv-skill-category-entity__name, .t-16.t-bold');
                skills.forEach(skill => {
                    const skillText = skill.textContent?.trim();
                    if (skillText && !processedText.has(skillText)) {
                        result += `- ${processText(skillText)}\n`;
                        processedText.add(skillText);
                    }
                });
            }
            
            // Extract certifications
            const certificationsSection = element.querySelector('#certifications-section, [data-test-id="certifications-section"]');
            if (certificationsSection) {
                result += "\n## Certifications\n";
                
                const certifications = certificationsSection.querySelectorAll('.pv-certification-entity, .pv-profile-section__list-item');
                certifications.forEach(cert => {
                    const certName = cert.querySelector('.t-16.t-bold, .pv-entity__title');
                    if (certName) {
                        const certText = certName.textContent?.trim();
                        if (certText && !processedText.has(certText)) {
                            result += `- ${processText(certText)}\n`;
                            processedText.add(certText);
                        }
                    }
                });
            }
        } else {
            // Process posts
            const posts = element.querySelectorAll(postSelectors.join(', '));
            if (posts.length > 0) {
                result += "# POSTS\n\n";
                
                posts.forEach((post, index) => {
                    result += `## Post ${index + 1}\n`;
                    
                    // Extract author information
                    const author = post.querySelector(userSelectors.join(', '));
                    if (author) {
                        const authorText = author.textContent?.trim();
                        if (authorText && !processedText.has(authorText)) {
                            // Apply deduplication to author text
                            const dedupedText = this.deduplicateRepeatedText(processText(authorText));
                            result += `**Author:** ${dedupedText}\n`;
                            processedText.add(authorText);
                        }
                    }
                    
                    // Extract post content
                    const contentElements = post.querySelectorAll('p, div.content, div.text, [data-testid="tweetText"]');
                    if (contentElements.length > 0) {
                        result += "**Content:**\n";
                        contentElements.forEach(el => {
                            // Check for spans first
                            const spanContent = processSpans(el);
                            if (spanContent) {
                                result += spanContent;
                            } else {
                                // Process the element itself if no spans were found
                                const text = el.textContent?.trim();
                                if (text && !processedText.has(text) && text.length > 1) {
                                    // Apply deduplication to content text
                                    const dedupedText = this.deduplicateRepeatedText(processText(text));
                                    result += `${dedupedText}\n`;
                                    processedText.add(text);
                                }
                            }
                        });
                        result += "\n";
                    }
                    
                    // Extract engagement metrics
                    const metrics = post.querySelectorAll('[data-testid="like"], [aria-label*="like"], [aria-label*="comment"], [aria-label*="share"], .engagement, .metrics');
                    if (metrics.length > 0) {
                        result += "**Engagement:**\n";
                        metrics.forEach(metric => {
                            // Check for spans first
                            const spanContent = processSpans(metric);
                            if (spanContent) {
                                result += `- ${spanContent}`;
                            } else {
                                const text = metric.textContent?.trim();
                                if (text && !processedText.has(text) && text.length > 1) {
                                    // Apply deduplication to metric text
                                    const dedupedText = this.deduplicateRepeatedText(processText(text));
                                    result += `- ${dedupedText}\n`;
                                    processedText.add(text);
                                }
                            }
                        });
                        result += "\n";
                    }
                    
                    // Extract comments/replies
                    const comments = post.querySelectorAll(commentSelectors.join(', '));
                    if (comments.length > 0) {
                        result += "**Comments:**\n";
                        comments.forEach((comment, commentIndex) => {
                            const commentAuthor = comment.querySelector(userSelectors.join(', '));
                            const commentText = comment.querySelector('p, .text, .content');
                            
                            let commentLine = `- Comment ${commentIndex + 1}`;
                            if (commentAuthor) {
                                const authorText = commentAuthor.textContent?.trim();
                                if (authorText) {
                                    // Apply deduplication to author text
                                    const dedupedText = this.deduplicateRepeatedText(processText(authorText));
                                    commentLine += ` from ${dedupedText}`;
                                }
                            }
                            commentLine += ": ";
                            
                            if (commentText) {
                                // Check for spans in the comment text
                                const spanContent = processSpans(commentText);
                                if (spanContent) {
                                    commentLine += spanContent.replace(/\n/g, ' ');
                                } else {
                                    const text = commentText.textContent?.trim();
                                    if (text && text.length > 1) {
                                        // Apply deduplication to comment text
                                        const dedupedText = this.deduplicateRepeatedText(processText(text));
                                        commentLine += dedupedText;
                                    }
                                }
                            }
                            
                            if (!processedText.has(commentLine) && commentLine.length > 15) {
                                result += `${commentLine}\n`;
                                processedText.add(commentLine);
                            }
                        });
                        result += "\n";
                    }
                    
                    result += "---\n\n";
                });
            }
            
            // Extract profile information if it's a profile page
            const profileInfo = element.querySelector('.profile-info, .user-profile, [data-testid="UserProfileHeader"]');
            if (profileInfo) {
                result += "# PROFILE INFORMATION\n\n";
                
                // Extract name and handle
                const name = profileInfo.querySelector('.fullname, .name, [data-testid="UserName"]');
                const handle = profileInfo.querySelector('.username, .handle, [data-testid="UserScreenName"]');
                
                if (name) {
                    const nameText = name.textContent?.trim();
                    if (nameText && !processedText.has(nameText)) {
                        result += `**Name:** ${processText(nameText)}\n`;
                        processedText.add(nameText);
                    }
                }
                
                if (handle) {
                    const handleText = handle.textContent?.trim();
                    if (handleText && !processedText.has(handleText)) {
                        result += `**Handle:** ${processText(handleText)}\n`;
                        processedText.add(handleText);
                    }
                }
                
                // Extract bio
                const bio = profileInfo.querySelector('.bio, .description, [data-testid="UserDescription"]');
                if (bio) {
                    // Check for spans in the bio
                    const spanContent = processSpans(bio);
                    if (spanContent) {
                        result += `**Bio:**\n${spanContent}\n`;
                    } else {
                        const bioText = bio.textContent?.trim();
                        if (bioText && !processedText.has(bioText)) {
                            result += `**Bio:** ${processText(bioText)}\n`;
                            processedText.add(bioText);
                        }
                    }
                }
                
                // Extract follower information
                const followers = profileInfo.querySelector('[data-testid="UserFollowers"], .followers, .follower-count');
                const following = profileInfo.querySelector('[data-testid="UserFollowing"], .following, .following-count');
                
                if (followers) {
                    const followersText = followers.textContent?.trim();
                    if (followersText && !processedText.has(followersText)) {
                        result += `**Followers:** ${processText(followersText)}\n`;
                        processedText.add(followersText);
                    }
                }
                
                if (following) {
                    const followingText = following.textContent?.trim();
                    if (followingText && !processedText.has(followingText)) {
                        result += `**Following:** ${processText(followingText)}\n`;
                        processedText.add(followingText);
                    }
                }
                
                result += "\n";
            }
        }
        
        // If no structured content was found, fall back to standard processing
        if (result.trim() === '') {
            return this.processStandardContent(element, options);
        }
        
        // Clean up the result by removing duplicate newlines and extra spaces
        return result.trim()
            .replace(/\n{3,}/g, '\n\n')  // Normalize spacing
            .replace(/\s{2,}/g, ' ')     // Replace multiple spaces with a single space
            .replace(/\n +/g, '\n');     // Remove spaces at the beginning of lines
    }

    /**
     * Removes repeated text patterns that often appear in mobile/desktop hybrid views
     * @private
     * @param {string} text - The text to deduplicate
     * @returns {string} Text with repetitions removed
     */
    private deduplicateRepeatedText(text: string): string {
        // Handle exact repetition (text followed by identical text)
        if (text.length > 10) {
            const halfLength = Math.floor(text.length / 2);
            const firstHalf = text.substring(0, halfLength);
            const secondHalf = text.substring(halfLength);
            
            if (firstHalf === secondHalf) {
                return firstHalf;
            }
            
            // Check for near-exact repetition with small variations
            if (firstHalf.length > 10 && secondHalf.includes(firstHalf.substring(0, firstHalf.length - 5))) {
                return firstHalf;
            }
        }
        
        // Handle common patterns like "Text 123 membersText 123 members 123 members"
        const patterns = [
            // Pattern: "Something Something"
            /(.{10,}?)(\s+\1)/g,
            
            // Pattern: "Text 123 membersText 123 members"
            /(.+?)(\d[\d,]+ \w+)\1\2/g,
            
            // Pattern: "Text 123 members 123 members"
            /(.+?)(\d[\d,]+ \w+)(\s+\2)/g,
            
            // Pattern: "Something • SomethingSomething"
            /(.+?)(\s+[•·]\s+)(.+?)\3/g,
            
            // New patterns for the examples provided
            // Pattern: "Name Name Number membersNumber members"
            /([\w\s]+)([\w\s]+)(\d[\d,]+ \w+)\3/g,
            
            // Pattern: "Name Number membersName Number members"
            /([\w\s]+)(\d[\d,]+ \w+)\1\2/g,
            
            // Pattern: "Number membersNumber members"
            /(\d[\d,]+ \w+)\1/g,
            
            // Pattern: "Name Name Number"
            /([\w\s]+)\1(\d[\d,]+)/g,
            
            // Pattern: "Name • NameName"
            /([\w\s]+)(\s+[•·]\s+)([\w\s]+)\3/g,
            
            // LinkedIn specific patterns
            // Pattern: "1st degree connection 1st"
            /(1st degree connection)\s+(1st)/g,
            
            // Pattern: "followers followers"
            /(\d[\d,]+\s+followers)\s+\1/g,
            
            // Pattern: "connections connections"
            /(\d[\d,]+\+?\s+connections)\s+\1/g,
            
            // Pattern: "Company · Full-timeCompany · Full-time"
            /([\w\s]+)(\s+·\s+Full-time)\1\2/g,
            
            // Pattern: "Jan 2023 - Present · 2 yrs 3 mosJan 2023 to Present · 2 yrs 3 mos"
            /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s+-\s+(Present|[A-Za-z]+\s+\d{4})\s+·\s+(.+?)(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s+to\s+(Present|[A-Za-z]+\s+\d{4})\s+·\s+\3/g,
            
            // Pattern: "New York City Metropolitan AreaNew York City Metropolitan Area"
            /([\w\s,]+Area)\1/g,
            
            // Pattern: "Show credential Show credential"
            /(Show credential)\s+\1/g,
            
            // Pattern: "Credential ID HSRTRYCZHDWC Credential ID HSRTRYCZHDWC"
            /(Credential ID [A-Z0-9]+)\s+\1/g
        ];
        
        let dedupedText = text;
        for (const pattern of patterns) {
            dedupedText = dedupedText.replace(pattern, (_, p1, p2, p3, p4, p5) => {
                // Handle date patterns specifically
                if (p4 && p5 && /Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/.test(p1)) {
                    return `${p1} ${p2} · ${p3}`;
                }
                
                // If p3 exists and we're dealing with specific patterns
                if (p3) {
                    if (pattern.toString().includes('Number members')) {
                        return `${p1}${p2}`;
                    }
                    if (pattern.toString().includes('degree connection')) {
                        return p1;
                    }
                    return `${p1}${p2}${p3}`;
                }
                
                // Otherwise, we're dealing with simpler patterns
                return `${p1}${p2 || ''}`;
            });
        }
        
        // Handle specific cases that might not be caught by the patterns above
        dedupedText = dedupedText
            // Fix "Name Number membersNumber members"
            .replace(/(\w[\w\s]+)(\d[\d,]+ \w+)(\d[\d,]+ \w+)/g, '$1$2')
            
            // Fix standalone "Number members" after a line with the same
            .replace(/(.+\d[\d,]+ \w+.*\n)(\d[\d,]+ \w+)/g, '$1')
            
            // Fix "Show all X • NameName"
            .replace(/(Show all \w+\s+[•·]\s+)([\w\s]+)\2/g, '$1$2')
            
            // Fix LinkedIn specific patterns
            // Fix "Click to upgrade to Premium" duplicates
            .replace(/(Click to upgrade to Premium).*\n\1/g, '$1')
            
            // Fix "Co-founder and CEO at Elm AI | AI, Impact, Supply Chains | Cornell Tech" duplicates
            .replace(/(Co-founder and CEO at.*Cornell Tech).*\n\1/g, '$1')
            
            // Fix "We are using AI to help businesses..." duplicates
            .replace(/(We are using AI to help businesses.*)\n\1/g, '$1')
            
            // Fix "Working in user generated content platform..." duplicates
            .replace(/(Working in user generated content platform.*)\n\1/g, '$1')
            
            // Fix "Activities and societies: Winner of the Cornell Tech Startup Award" duplicates
            .replace(/(Activities and societies:.*)\n\1/g, '$1')
            
            // Fix "Master of Engineering in Computer Science" duplicates
            .replace(/(Master of Engineering in Computer Science)\n\1/g, '$1')
            
            // Fix "Full professional proficiency" duplicates
            .replace(/(Full professional proficiency)\n\1/g, '$1')
            
            // Fix "Professional working proficiency" duplicates
            .replace(/(Professional working proficiency)\n\1/g, '$1')
            
            // Fix "12+ Years in Product Development..." duplicates
            .replace(/(12\+ Years in Product Development.*)\n\1/g, '$1')
            
            // Fix "Senior Strategy Associate @ BWD Strategic..." duplicates
            .replace(/(Senior Strategy Associate @ BWD Strategic.*)\n\1/g, '$1');
        
        return dedupedText;
    }

    /**
     * Deduplicates the final output to remove repeated paragraphs and sections
     * @param {string} text - The text to deduplicate
     * @returns {string} Deduplicated text
     */
    private deduplicateFinalOutput(text: string): string {
        // Split text into paragraphs
        const paragraphs = text.split(/\n{2,}|\r\n{2,}/);
        const uniqueParagraphs: string[] = [];
        const seenParagraphs = new Set<string>();
        
        // Process each paragraph
        for (const paragraph of paragraphs) {
            const trimmed = paragraph.trim();
            
            // Skip empty paragraphs
            if (!trimmed) continue;
            
            // Skip if we've seen this exact paragraph before
            if (seenParagraphs.has(trimmed)) continue;
            
            // Check for near-duplicate paragraphs (>80% similarity)
            let isDuplicate = false;
            for (const existing of seenParagraphs) {
                if (this.calculateSimilarity(trimmed, existing) > 0.8) {
                    isDuplicate = true;
                    break;
                }
            }
            
            if (!isDuplicate) {
                uniqueParagraphs.push(trimmed);
                seenParagraphs.add(trimmed);
            }
        }
        
        // Join unique paragraphs back together
        return uniqueParagraphs.join('\n\n');
    }

    /**
     * Calculates similarity between two strings (0-1 scale)
     * @private
     * @param {string} str1 - First string to compare
     * @param {string} str2 - Second string to compare
     * @returns {number} Similarity score between 0 and 1
     */
    private calculateSimilarity(str1: string, str2: string): number {
        // If either string is empty, return 0
        if (!str1.length || !str2.length) return 0;
        
        // If strings are identical, return 1
        if (str1 === str2) return 1;
        
        // If one string contains the other, return a high similarity
        if (str1.includes(str2) || str2.includes(str1)) {
            return 0.9;
        }
        
        // Calculate Levenshtein distance
        const len1 = str1.length;
        const len2 = str2.length;
        
        // Use a simplified approach for long strings to avoid performance issues
        if (len1 > 100 || len2 > 100) {
            // Compare first 50 chars, middle 50 chars, and last 50 chars
            const compareStart = this.calculateLevenshteinSimilarity(
                str1.substring(0, 50), 
                str2.substring(0, 50)
            );
            
            const mid1Start = Math.max(0, Math.floor(len1 / 2) - 25);
            const mid2Start = Math.max(0, Math.floor(len2 / 2) - 25);
            const compareMiddle = this.calculateLevenshteinSimilarity(
                str1.substring(mid1Start, mid1Start + 50), 
                str2.substring(mid2Start, mid2Start + 50)
            );
            
            const compareEnd = this.calculateLevenshteinSimilarity(
                str1.substring(Math.max(0, len1 - 50)), 
                str2.substring(Math.max(0, len2 - 50))
            );
            
            // Average the three similarity scores
            return (compareStart + compareMiddle + compareEnd) / 3;
        }
        
        // For shorter strings, calculate full Levenshtein similarity
        return this.calculateLevenshteinSimilarity(str1, str2);
    }

    /**
     * Calculates Levenshtein similarity between two strings
     * @private
     * @param {string} str1 - First string to compare
     * @param {string} str2 - Second string to compare
     * @returns {number} Similarity score between 0 and 1
     */
    private calculateLevenshteinSimilarity(str1: string, str2: string): number {
        const len1 = str1.length;
        const len2 = str2.length;
        
        // Create a matrix of size (len1+1) x (len2+1)
        const matrix: number[][] = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
        
        // Initialize the first row and column
        for (let i = 0; i <= len1; i++) {
            matrix[i][0] = i;
        }
        
        for (let j = 0; j <= len2; j++) {
            matrix[0][j] = j;
        }
        
        // Fill the matrix
        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,      // deletion
                    matrix[i][j - 1] + 1,      // insertion
                    matrix[i - 1][j - 1] + cost // substitution
                );
            }
        }
        
        // Calculate similarity as 1 - (distance / max length)
        const distance = matrix[len1][len2];
        const maxLength = Math.max(len1, len2);
        return 1 - (distance / maxLength);
    }

    /**
     * Applies deduplication to all cleaning methods
     */
    private applyDeduplicationToAllMethods(): void {
        // Store original methods
        const originalClean = this.clean;
        const originalCleanSemantic = this.cleanSemantic;
        const originalCleanForInteractive = this.cleanForInteractive;
        const originalPreserveSemanticHierarchy = this.preserveSemanticHierarchy;
        const originalCleanForLLM = this.cleanForLLM;
        
        // Override methods to apply deduplication
        this.clean = (html: string): string => {
            return this.deduplicateFinalOutput(originalClean.call(this, html));
        };
        
        this.cleanSemantic = (html: string): string => {
            return this.deduplicateFinalOutput(originalCleanSemantic.call(this, html));
        };
        
        this.cleanForInteractive = (html: string): string => {
            return this.deduplicateFinalOutput(originalCleanForInteractive.call(this, html));
        };
        
        this.preserveSemanticHierarchy = (html: string): string => {
            return this.deduplicateFinalOutput(originalPreserveSemanticHierarchy.call(this, html));
        };
        
        this.cleanForLLM = (html: string, options: { ignoreLinks?: boolean } = {}): string => {
            return this.deduplicateFinalOutput(originalCleanForLLM.call(this, html, options));
        };
    }

    /**
     * Processes HTML tables into markdown format
     * @private
     * @param {HTMLElement} element - The root element to process
     * @returns {string} Markdown formatted tables
     */
    // private processTables(element: HTMLElement): string {
    //     let result = '';
    //     const tables = element.querySelectorAll('table');
        
    //     tables.forEach((table, tableIndex) => {
    //         result += `\n### Table ${tableIndex + 1}\n\n`;
            
    //         // Get table caption if available
    //         const caption = table.querySelector('caption');
    //         if (caption) {
    //             const captionText = caption.textContent?.trim();
    //             if (captionText) {
    //                 result += `**${captionText}**\n\n`;
    //             }
    //         }
            
    //         // Process table headers
    //         const headers = Array.from(table.querySelectorAll('th')).map(th => 
    //             th.textContent?.trim() || '');
            
    //         if (headers.length > 0) {
    //             // Create markdown table header
    //             result += `| ${headers.join(' | ')} |\n`;
    //             result += `| ${headers.map(() => '---').join(' | ')} |\n`;
                
    //             // Process table rows
    //             const rows = table.querySelectorAll('tr');
    //             rows.forEach(row => {
    //                 // Skip header rows
    //                 if (row.querySelector('th')) return;
                    
    //                 const cells = Array.from(row.querySelectorAll('td')).map(td => 
    //                     td.textContent?.trim().replace(/\n/g, ' ') || '');
                    
    //                 if (cells.length > 0) {
    //                     // Ensure we have the right number of cells
    //                     while (cells.length < headers.length) {
    //                         cells.push('');
    //                     }
    //                     result += `| ${cells.join(' | ')} |\n`;
    //                 }
    //             });
    //         } else {
    //             // Table without headers - create simple representation
    //             const rows = table.querySelectorAll('tr');
    //             rows.forEach(row => {
    //                 const cells = Array.from(row.querySelectorAll('td')).map(td => 
    //                     td.textContent?.trim().replace(/\n/g, ' ') || '');
                    
    //                 if (cells.length > 0) {
    //                     if (result.indexOf('|') === -1) {
    //                         // First row - create header
    //                         result += `| ${cells.join(' | ')} |\n`;
    //                         result += `| ${cells.map(() => '---').join(' | ')} |\n`;
    //                     } else {
    //                         result += `| ${cells.join(' | ')} |\n`;
    //                     }
    //                 }
    //             });
    //         }
            
    //         result += '\n';
    //     });
        
    //     return result;
    // }

    /**
     * Classifies the type of content in the HTML
     * @private
     * @param {HTMLElement} element - The root element to process
     * @returns {string} Content classification information
     */
    // private classifyContent(element: HTMLElement): string {
    //     const classifications = [];
        
    //     // Check for article content
    //     if (element.querySelector('article, [role="article"], .post, .article')) {
    //         classifications.push('Article/Blog Post');
    //     }
        
    //     // Check for product page
    //     if (element.querySelector('.product, [itemtype*="Product"], #product, .pdp')) {
    //         classifications.push('Product Page');
    //     }
        
    //     // Check for profile page
    //     if (element.querySelector('.profile, .user-profile, [data-testid="UserProfileHeader"]')) {
    //         classifications.push('Profile Page');
    //     }
        
    //     // Check for search results
    //     if (element.querySelector('.search-results, [data-testid="search-results"], .serp')) {
    //         classifications.push('Search Results');
    //     }
        
    //     // Check for forum/discussion
    //     if (element.querySelector('.forum, .discussion, .thread, .comments-section')) {
    //         classifications.push('Forum/Discussion');
    //     }
        
    //     // Check for documentation
    //     if (element.querySelector('.documentation, .docs, .api-docs, .technical-content')) {
    //         classifications.push('Documentation');
    //     }
        
    //     // Check for news
    //     if (element.querySelector('.news, .press-release, [data-category="news"]')) {
    //         classifications.push('News');
    //     }
        
    //     // Check for e-commerce
    //     if (element.querySelector('.shop, .store, .cart, .checkout, [data-testid="add-to-cart"]')) {
    //         classifications.push('E-commerce');
    //     }
        
    //     if (classifications.length > 0) {
    //         return `## Content Classification\n\nThis appears to be: ${classifications.join(', ')}\n\n`;
    //     }
        
    //     return '';
    // }

    /**
     * Attempts to extract the main content from a page
     * @private
     * @param {HTMLElement} element - The root element to process
     * @returns {string} The main content
     */
    // private extractMainContent(element: HTMLElement): string {
    //     // Try to find main content area using common selectors
    //     const mainContentSelectors = [
    //         'main',
    //         'article',
    //         '[role="main"]',
    //         '#content',
    //         '.content',
    //         '.main-content',
    //         '.post-content',
    //         '.article-content',
    //         '.entry-content'
    //     ];
        
    //     // Find the element with the most text content
    //     let bestElement: HTMLElement | null = null;
    //     let maxLength = 0;
        
    //     for (const selector of mainContentSelectors) {
    //         const elements = Array.from(element.querySelectorAll(selector)) as HTMLElement[];
    //         for (const el of elements) {
    //             const length = (el.textContent || '').length;
    //             if (length > maxLength) {
    //                 maxLength = length;
    //                 bestElement = el;
    //             }
    //         }
    //     }
        
    //     // If we found main content, return it
    //     if (bestElement && maxLength > 200) {
    //         return `## Main Content\n\n${bestElement.textContent?.trim() || ''}\n\n`;
    //     }
        
    //     return '';
    // }

    /**
     * Creates a structured representation of HTML with element IDs for easy reference,
     * optimized to reduce noise and focus on meaningful content.
     * @param {string} html - The HTML content to process
     * @param {Object} options - Configuration options
     * @param {boolean} [options.includeCodeBlocks=false] - Whether to include code blocks in the output
     * @param {boolean} [options.includeScripts=false] - Whether to include script content in the output
     * @returns {Object} Object containing the structured content, element mapping, and reference mapping
     */
    cleanWithElementIDs(html: string, options: { 
        includeCodeBlocks?: boolean,
        includeScripts?: boolean
    } = {}): { 
        content: string, 
        elements: Record<string, { type: string, text: string, attributes?: Record<string, string> }>,
        references: Record<string, string | { href?: string, class?: string, selector?: string }>
    } {
        const includeCodeBlocks = options.includeCodeBlocks || false;
        const includeScripts = options.includeScripts || false;
        
        let tempElement = document.createElement('div');
        tempElement.innerHTML = html;
        
        // Remove unwanted elements
        this.tagsToRemove.forEach(tag => {
            if (tag !== 'a' && tag !== 'button' && tag !== 'input' && tag !== 'select' && tag !== 'textarea') {
                let elements = tempElement.querySelectorAll(tag);
                elements.forEach(el => el.remove());
            }
        });
        
        // Clean attributes except important ones
        const allowedAttributes = ['href', 'type', 'value', 'placeholder', 'name', 'checked', 'selected', 'class', 'id'];
        const allElements = tempElement.querySelectorAll('*');
        allElements.forEach(el => {
            Array.from(el.attributes).forEach(attr => {
                if (!allowedAttributes.includes(attr.name)) {
                    el.removeAttribute(attr.name);
                }
            });
        });
        
        // Track elements and references
        const elements: Record<string, { type: string, text: string, attributes?: Record<string, string> }> = {};
        const references: Record<string, string | { href?: string, class?: string, selector?: string }> = {};
        let elementCounter = 1;
        
        // Set to track processed text to avoid duplicates
        const processedText = new Set<string>();
        
        // Set to track processed interactive elements to avoid duplicates
        const processedInteractiveElements = new Set<Element>();
        
        // Pre-process interactive elements first to ensure they're prioritized
        const preProcessInteractiveElements = (rootElement: Element): void => {
            // Process buttons first
            rootElement.querySelectorAll('button').forEach(button => {
                processedInteractiveElements.add(button);
            });
            
            // Process inputs
            rootElement.querySelectorAll('input').forEach(input => {
                processedInteractiveElements.add(input);
            });
            
            // Process textareas
            rootElement.querySelectorAll('textarea').forEach(textarea => {
                processedInteractiveElements.add(textarea);
            });
            
            // Process selects
            rootElement.querySelectorAll('select').forEach(select => {
                processedInteractiveElements.add(select);
            });
            
            // Process links
            rootElement.querySelectorAll('a[href]').forEach(link => {
                processedInteractiveElements.add(link);
            });
        };
        
        // Helper function to create a selector for an element
        const createSelector = (element: Element): string => {
            const tagName = element.tagName.toLowerCase();
            let selector = tagName;
            
            // Add ID if available
            if (element.id) {
                selector += `#${element.id}`;
            }
            
            // Add classes if available
            if (element.className && typeof element.className === 'string') {
                const classes = element.className.split(/\s+/).filter(Boolean);
                classes.forEach(cls => {
                    selector += `.${cls}`;
                });
            }
            
            return selector;
        };
        
        // Pre-process interactive elements
        preProcessInteractiveElements(tempElement);
        
        // Process the document to create a structured representation with element IDs
        const processNode = (node: Node, depth: number = 0, insideCodeBlock: boolean = false): string => {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent?.trim();
                return text ? text + ' ' : '';
            }
            
            if (node.nodeType !== Node.ELEMENT_NODE) return '';
            
            const element = node as Element;
            
            // Skip if this element has already been processed as an interactive element
            if (processedInteractiveElements.has(element)) {
                processedInteractiveElements.delete(element); // Remove from set to process it now
            }
            
            const tagName = element.tagName.toLowerCase();
            const indent = '  '.repeat(depth);
            let result = '';
            
            // Skip processing elements that are typically not useful for LLM understanding
            const skipElements = ['script', 'style', 'noscript', 'svg', 'canvas', 'iframe', 'footer'];
            if (!includeScripts && skipElements.includes(tagName)) {
                return '';
            }
            
            // Check if we're entering a code block
            if (tagName === 'code' || tagName === 'pre') {
                // Skip processing code blocks unless explicitly requested
                if (includeCodeBlocks) {
                    const elementId = `${tagName}_${elementCounter}`;
                    elements[elementId] = { 
                        type: tagName,
                        text: element.textContent?.trim() || ''
                    };
                    
                    // Store class and selector information
                    const classAttr = element.getAttribute('class');
                    const selector = createSelector(element);
                    references[elementId] = {
                        class: classAttr || undefined,
                        selector: selector
                    };
                    
                    result += `[code block] [${elementId}]\n\n`;
                    elementCounter++;
                }
                return result;
            }
            
            // If we're inside a code block, don't process this node
            if (insideCodeBlock) {
                return '';
            }
            
            // Handle headings - these are important for document structure
            if (/^h[1-6]$/.test(tagName)) {
                const level = parseInt(tagName.substring(1));
                const prefix = '#'.repeat(level);
                const text = element.textContent?.trim();
                if (text && !processedText.has(text)) {
                    const elementId = `h${level}_${elementCounter}`;
                    elements[elementId] = { 
                        type: tagName,
                        text: text
                    };
                    
                    // Store class and selector information
                    const classAttr = element.getAttribute('class');
                    const selector = createSelector(element);
                    references[elementId] = {
                        class: classAttr || undefined,
                        selector: selector
                    };
                    
                    result += `${indent}${prefix} ${text} [${elementId}]\n\n`;
                    elementCounter++;
                    processedText.add(text);
                }
            } 
            // Handle links with reference - important for navigation and context
            else if (tagName === 'a' && element.hasAttribute('href')) {
                const text = element.textContent?.trim();
                const href = element.getAttribute('href');
                
                if (text && text.length > 1 && !processedText.has(`${text}${href}`)) {
                    const elementId = `link_${elementCounter}`;
                    elements[elementId] = { 
                        type: 'link',
                        text: text,
                        attributes: { href: href || '' }
                    };
                    
                    // Store href, class and selector information
                    const classAttr = element.getAttribute('class');
                    const selector = createSelector(element);
                    references[elementId] = {
                        href: href || undefined,
                        class: classAttr || undefined,
                        selector: selector
                    };
                    
                    result += `${text} [${elementId}] `;
                    elementCounter++;
                    processedText.add(`${text}${href}`);
                }
            }
            // Handle buttons - important for interactive elements
            else if (tagName === 'button') {
                const text = element.textContent?.trim();
                
                if (text && text.length > 1 && !processedText.has(`button:${text}`)) {
                    const elementId = `btn_${elementCounter}`;
                    
                    // Store button attributes
                    const attributes: Record<string, string> = {};
                    const type = element.getAttribute('type');
                    const name = element.getAttribute('name');
                    const value = element.getAttribute('value');
                    const class_val = element.getAttribute('class')
                    
                    if (type) attributes.type = type;
                    if (name) attributes.name = name;
                    if (value) attributes.value = value;
                    if (class_val) attributes.class = class_val
                    
                    elements[elementId] = { 
                        type: 'button',
                        text: text,
                        attributes: Object.keys(attributes).length > 0 ? attributes : undefined
                    };
                    
                    // Store class and selector information
                    const classAttr = element.getAttribute('class');
                    const selector = createSelector(element);
                    references[elementId] = {
                        class: classAttr || undefined,
                        selector: selector
                    };
                    
                    result += `[Button: ${text}] [${elementId}] `;
                    elementCounter++;
                    processedText.add(`button:${text}`);
                }
            }
            // Handle input elements - important for forms
            else if (tagName === 'input') {
                const type = element.getAttribute('type') || 'text';
                const value = (element as HTMLInputElement).value;
                const placeholder = element.getAttribute('placeholder');
                const name = element.getAttribute('name');
                const checked = (element as HTMLInputElement).checked;
                const class_val = element.getAttribute('class')
                
                const elementId = `input_${elementCounter}`;
                const attributes: Record<string, string> = { type };
                if (value) attributes.value = value;
                if (placeholder) attributes.placeholder = placeholder;
                if (name) attributes.name = name;
                if (checked) attributes.checked = 'true';
                if (class_val) attributes.class = class_val
                
                elements[elementId] = { 
                    type: 'input',
                    text: placeholder || name || type,
                    attributes
                };
                
                // Store class and selector information
                const classAttr = element.getAttribute('class');
                const selector = createSelector(element);
                references[elementId] = {
                    class: classAttr || undefined,
                    selector: selector
                };
                
                let displayText = `[${type} input`;
                if (placeholder) displayText += ` "${placeholder}"`;
                else if (name) displayText += ` name="${name}"`;
                if (value) displayText += ` value="${value}"`;
                if (checked) displayText += ` (checked)`;
                displayText += `]`;
                
                result += `${displayText} [${elementId}] `;
                elementCounter++;
            }
            // Handle select elements
            else if (tagName === 'select') {
                const name = element.getAttribute('name');
                const options = Array.from(element.querySelectorAll('option'))
                    .map(opt => ({
                        value: opt.getAttribute('value') || '',
                        text: opt.textContent?.trim() || '',
                        selected: (opt as HTMLOptionElement).selected
                    }));
                
                const elementId = `select_${elementCounter}`;
                elements[elementId] = { 
                    type: 'select',
                    text: name || 'dropdown',
                    attributes: { 
                        name: name || '',
                        options: JSON.stringify(options)
                    }
                };
                
                // Store class and selector information
                const classAttr = element.getAttribute('class');
                const selector = createSelector(element);
                references[elementId] = {
                    class: classAttr || undefined,
                    selector: selector
                };
                
                let displayText = `[Dropdown`;
                if (name) displayText += ` name="${name}"`;
                displayText += `]`;
                
                result += `${displayText} [${elementId}] `;
                elementCounter++;
            }
            // Handle textarea elements
            else if (tagName === 'textarea') {
                const value = (element as HTMLTextAreaElement).value;
                const placeholder = element.getAttribute('placeholder');
                const name = element.getAttribute('name');
                const class_val = element.getAttribute('class')
                
                const elementId = `textarea_${elementCounter}`;
                const attributes: Record<string, string> = {};
                if (value) attributes.value = value;
                if (placeholder) attributes.placeholder = placeholder;
                if (name) attributes.name = name;
                if (class_val) attributes.class = class_val
                
                elements[elementId] = { 
                    type: 'textarea',
                    text: placeholder || name || 'text area',
                    attributes
                };
                
                // Store class and selector information
                const classAttr = element.getAttribute('class');
                const selector = createSelector(element);
                references[elementId] = {
                    class: classAttr || undefined,
                    selector: selector
                };
                
                let displayText = `[Text area`;
                if (placeholder) displayText += ` "${placeholder}"`;
                else if (name) displayText += ` name="${name}"`;
                displayText += `]`;
                
                result += `${displayText} [${elementId}] `;
                elementCounter++;
            }
            // Handle paragraphs
            else if (tagName === 'p') {
                // Check if this paragraph contains any interactive elements that need to be processed first
                const interactiveElements = element.querySelectorAll('button, input, textarea, select, a[href]');
                let hasInteractiveElements = false;
                
                if (interactiveElements.length > 0) {
                    hasInteractiveElements = true;
                    interactiveElements.forEach(interactive => {
                        if (processedInteractiveElements.has(interactive)) {
                            // Process this interactive element now
                            const interactiveContent = processNode(interactive, depth + 1, false);
                            if (interactiveContent) {
                                result += interactiveContent;
                            }
                            processedInteractiveElements.delete(interactive);
                        }
                    });
                }
                
                // Now process the rest of the paragraph content
                let paragraphContent = '';
                if (!hasInteractiveElements) {
                    paragraphContent = Array.from(element.childNodes)
                        .map(child => processNode(child, depth + 1, false))
                        .join('')
                        .trim();
                } else {
                    // Only process non-interactive children
                    paragraphContent = Array.from(element.childNodes)
                        .filter(child => {
                            if (child.nodeType !== Node.ELEMENT_NODE) return true;
                            const childEl = child as Element;
                            return !['button', 'input', 'textarea', 'select'].includes(childEl.tagName.toLowerCase()) && 
                                   !(childEl.tagName.toLowerCase() === 'a' && childEl.hasAttribute('href'));
                        })
                        .map(child => processNode(child, depth + 1, false))
                        .join('')
                        .trim();
                }
                
                if (paragraphContent) {
                    const elementId = `p_${elementCounter}`;
                    elements[elementId] = { 
                        type: 'paragraph',
                        text: element.textContent?.trim() || ''
                    };
                    
                    // Store class and selector information
                    const classAttr = element.getAttribute('class');
                    const selector = createSelector(element);
                    references[elementId] = {
                        class: classAttr || undefined,
                        selector: selector
                    };
                    
                    result += `${indent}${paragraphContent} [${elementId}]\n\n`;
                    elementCounter++;
                }
            }
            // Handle list items
            else if (tagName === 'li') {
                // Check if this list item contains any interactive elements that need to be processed first
                const interactiveElements = element.querySelectorAll('button, input, textarea, select, a[href]');
                let hasInteractiveElements = false;
                
                if (interactiveElements.length > 0) {
                    hasInteractiveElements = true;
                    interactiveElements.forEach(interactive => {
                        if (processedInteractiveElements.has(interactive)) {
                            // Process this interactive element now
                            const interactiveContent = processNode(interactive, depth + 1, false);
                            if (interactiveContent) {
                                result += interactiveContent;
                            }
                            processedInteractiveElements.delete(interactive);
                        }
                    });
                }
                
                // Now process the rest of the list item content
                let listItemContent = '';
                if (!hasInteractiveElements) {
                    listItemContent = Array.from(element.childNodes)
                        .map(child => processNode(child, depth + 1, false))
                        .join('')
                        .trim();
                } else {
                    // Only process non-interactive children
                    listItemContent = Array.from(element.childNodes)
                        .filter(child => {
                            if (child.nodeType !== Node.ELEMENT_NODE) return true;
                            const childEl = child as Element;
                            return !['button', 'input', 'textarea', 'select'].includes(childEl.tagName.toLowerCase()) && 
                                   !(childEl.tagName.toLowerCase() === 'a' && childEl.hasAttribute('href'));
                        })
                        .map(child => processNode(child, depth + 1, false))
                        .join('')
                        .trim();
                }
                
                if (listItemContent) {
                    const elementId = `li_${elementCounter}`;
                    elements[elementId] = { 
                        type: 'list-item',
                        text: element.textContent?.trim() || ''
                    };
                    
                    // Store class and selector information
                    const classAttr = element.getAttribute('class');
                    const selector = createSelector(element);
                    references[elementId] = {
                        class: classAttr || undefined,
                        selector: selector
                    };
                    
                    result += `${indent}• ${listItemContent} [${elementId}]\n\n`;
                    elementCounter++;
                }
            }
            // Handle pre elements (which often contain code blocks)
            else if (tagName === 'pre') {
                // Skip processing pre elements - just add a placeholder
                const elementId = `pre_${elementCounter}`;
                elements[elementId] = { 
                    type: 'pre',
                    text: element.textContent?.trim() || ''
                };
                
                // Store class and selector information
                const classAttr = element.getAttribute('class');
                const selector = createSelector(element);
                references[elementId] = {
                    class: classAttr || undefined,
                    selector: selector
                };
                
                result += `[code block] [${elementId}]\n\n`;
                elementCounter++;
            }
            // Handle divs and other block elements
            else if (['div', 'section', 'article', 'main', 'aside', 'header', 'footer'].includes(tagName)) {
                // Check if this element contains any interactive elements that need to be processed first
                const interactiveElements = element.querySelectorAll('button, input, textarea, select, a[href]');
                let interactiveContent = '';
                
                if (interactiveElements.length > 0) {
                    interactiveElements.forEach(interactive => {
                        if (processedInteractiveElements.has(interactive)) {
                            // Process this interactive element now
                            const content = processNode(interactive, depth + 1, false);
                            if (content) {
                                interactiveContent += content;
                            }
                            processedInteractiveElements.delete(interactive);
                        }
                    });
                }
                
                // Process remaining children with deduplication
                const childNodes = Array.from(element.childNodes);
                const processedChildContent = new Set<string>();
                let childContent = '';
                
                for (const child of childNodes) {
                    // Skip interactive elements that were already processed
                    if (child.nodeType === Node.ELEMENT_NODE) {
                        const childEl = child as Element;
                        const isInteractive = ['button', 'input', 'textarea', 'select'].includes(childEl.tagName.toLowerCase()) || 
                                             (childEl.tagName.toLowerCase() === 'a' && childEl.hasAttribute('href'));
                        
                        if (isInteractive && !processedInteractiveElements.has(childEl)) {
                            continue;
                        }
                    }
                    
                    const content = processNode(child, depth + 1, false).trim();
                    // Only add content if it's not a duplicate or empty
                    if (content && content.length > 3 && !processedChildContent.has(content)) {
                        childContent += content + ' ';
                        processedChildContent.add(content);
                    }
                }
                childContent = childContent.trim();
                
                // Combine interactive content with regular content
                let finalContent = interactiveContent + childContent;
                
                if (finalContent && finalContent.length > 3) {
                    const text = element.textContent?.trim() || '';
                    // Only add IDs to divs with significant content that hasn't been processed
                    if (finalContent.length > 20 && !processedText.has(text) && text.length > 20) {
                        const elementId = `${tagName}_${elementCounter}`;
                        elements[elementId] = { 
                            type: tagName,
                            text: text
                        };
                        
                        // Store class and selector information
                        const classAttr = element.getAttribute('class');
                        const selector = createSelector(element);
                        references[elementId] = {
                            class: classAttr || undefined,
                            selector: selector
                        };
                        
                        result += `${finalContent} [${elementId}]\n\n`;
                        elementCounter++;
                        processedText.add(text);
                    } else {
                        result += `${finalContent}\n\n`;
                    }
                }
            }
            // Handle spans and other inline elements
            else {
                // Check if this element contains any interactive elements that need to be processed first
                const interactiveElements = element.querySelectorAll('button, input, textarea, select, a[href]');
                let interactiveContent = '';
                
                if (interactiveElements.length > 0) {
                    interactiveElements.forEach(interactive => {
                        if (processedInteractiveElements.has(interactive)) {
                            // Process this interactive element now
                            const content = processNode(interactive, depth, false);
                            if (content) {
                                interactiveContent += content;
                            }
                            processedInteractiveElements.delete(interactive);
                        }
                    });
                }
                
                // Process remaining children with deduplication
                const childNodes = Array.from(element.childNodes);
                const processedChildContent = new Set<string>();
                let childContent = '';
                
                for (const child of childNodes) {
                    // Skip interactive elements that were already processed
                    if (child.nodeType === Node.ELEMENT_NODE) {
                        const childEl = child as Element;
                        const isInteractive = ['button', 'input', 'textarea', 'select'].includes(childEl.tagName.toLowerCase()) || 
                                             (childEl.tagName.toLowerCase() === 'a' && childEl.hasAttribute('href'));
                        
                        if (isInteractive && !processedInteractiveElements.has(childEl)) {
                            continue;
                        }
                    }
                    
                    const content = processNode(child, depth, false).trim();
                    // Only add content if it's not a duplicate or empty
                    if (content && content.length > 3 && !processedChildContent.has(content)) {
                        childContent += content + ' ';
                        processedChildContent.add(content);
                    }
                }
                childContent = childContent.trim();
                
                // Combine interactive content with regular content
                let finalContent = interactiveContent + childContent;
                
                if (finalContent && finalContent.length > 3) {
                    result += finalContent;
                }
            }
            
            return result;
        };
        
        // Start processing from the body
        const body = tempElement.querySelector('body') || tempElement;
        let content = processNode(body);
        
        // Clean up the content
        content = content
            .replace(/\n{3,}/g, '\n\n')  // Normalize spacing
            .replace(/\s{2,}/g, ' ')     // Replace multiple spaces with a single space
            .replace(/\n +/g, '\n')      // Remove spaces at the beginning of lines
            .trim();
        
        // Apply deduplication
        content = this.deduplicateFinalOutput(content);
        
        // Further clean up the content by removing redundant element IDs
        // This helps reduce noise in the final output
        content = content
            .replace(/\[\w+_\d+\]\s*\[\w+_\d+\]/g, '') // Remove adjacent element IDs
            .replace(/\n\s*\[\w+_\d+\]\s*\n/g, '\n')   // Remove element IDs on their own lines
            .replace(/\s{2,}/g, ' ')                   // Clean up extra spaces again
            .trim();
        
        return { content, elements, references };
    }
}