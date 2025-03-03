/**
 * API for executing browser actions from the extension UI
 */

/**
 * Execute a browser action in the active tab
 * @param type The type of action to execute
 * @param params Parameters for the action
 * @returns Promise resolving to the result of the action
 */
export async function executeBrowserAction(
  type: string, 
  params: Record<string, any>
): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        action: 'executeAction',
        type,
        params
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.success) {
          resolve(response.result);
        } else {
          reject(new Error(response?.error || 'Unknown error'));
        }
      }
    );
  });
}

// Convenience methods for common actions
export const browserActions = {
  /**
   * Click on an element matching the provided selector
   */
  click: (selector: string) => executeBrowserAction('click', { selector }),
  
  /**
   * Fill a form input with the provided value
   */
  fill: (selector: string, value: string) => 
    executeBrowserAction('fill', { selector, value }),
  
  /**
   * Select an option from a dropdown
   */
  select: (selector: string, value: string) => 
    executeBrowserAction('select', { selector, value }),
  
  /**
   * Scroll the page in the specified direction and amount
   */
  scroll: (direction: 'up' | 'down', amount: number) => 
    executeBrowserAction('scroll', { direction, amount }),
  
  /**
   * Navigate to a specified URL
   */
  navigateTo: (url: string) => executeBrowserAction('navigate', { url }),
  
  /**
   * Wait for an element to appear in the DOM
   */
  waitForElement: (selector: string, timeout?: number) => 
    executeBrowserAction('waitFor', { selector, timeout }),
  
  /**
   * Extract text content from an element
   */
  extractText: (selector: string) => 
    executeBrowserAction('extractText', { selector }),
  
  /**
   * Check if an element exists in the DOM
   */
  elementExists: (selector: string) => 
    executeBrowserAction('checkExists', { selector }),
  
  /**
   * Find all elements matching a selector and return their text content
   */
  findAllElements: (selector: string) => 
    executeBrowserAction('findAll', { selector }),
  
  /**
   * Submit a form
   */
  submitForm: (selector: string) => 
    executeBrowserAction('submitForm', { selector }),
  
  /**
   * Focus on an element
   */
  focusElement: (selector: string) => 
    executeBrowserAction('focus', { selector }),
  
  /**
   * Get attributes of an element
   */
  getElementAttributes: (selector: string, attributeNames: string[]) => 
    executeBrowserAction('getAttributes', { selector, attributeNames })
}; 