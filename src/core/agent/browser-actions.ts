/**
 * Browser action helper functions for AI agent interactions
 * These standalone functions can be used in agent workflows to interact with web pages
 */

/**
 * Click on an element matching the provided selector
 * @param selector CSS selector for the target element
 * @returns Promise resolving to true if click was successful, false otherwise
 */
export async function clickElement(selector: string): Promise<boolean> {
  try {
    const element = document.querySelector(selector);
    if (element && element instanceof HTMLElement) {
      element.click();
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error clicking element ${selector}:`, error);
    return false;
  }
}

/**
 * Fill a form input with the provided value
 * @param selector CSS selector for the input element
 * @param value Value to enter into the input
 * @returns Promise resolving to true if input was filled successfully, false otherwise
 */
export async function fillInput(selector: string, value: string): Promise<boolean> {
  try {
    const element = document.querySelector(selector);
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.value = value;
      
      // Trigger input and change events to simulate user typing
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error filling input ${selector}:`, error);
    return false;
  }
}

/**
 * Select an option from a dropdown
 * @param selector CSS selector for the select element
 * @param value Value to select
 * @returns Promise resolving to true if selection was successful, false otherwise
 */
export async function selectOption(selector: string, value: string): Promise<boolean> {
  try {
    const element = document.querySelector(selector);
    if (element instanceof HTMLSelectElement) {
      element.value = value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error selecting option in ${selector}:`, error);
    return false;
  }
}

/**
 * Scroll the page in the specified direction and amount
 * @param options Scroll options including direction and amount
 * @returns Promise resolving to void
 */
export async function scrollPage(options: { direction: 'up' | 'down', amount: number }): Promise<void> {
  try {
    window.scrollBy({
      top: options.direction === 'down' ? options.amount : -options.amount,
      behavior: 'smooth'
    });
    
    // Wait for scroll to complete
    return new Promise(resolve => setTimeout(resolve, 300));
  } catch (error) {
    console.error('Error scrolling page:', error);
  }
}

/**
 * Navigate to a specified URL
 * @param url URL to navigate to
 * @returns Promise resolving to void
 */
export async function navigateTo(url: string): Promise<void> {
  try {
    window.location.href = url;
  } catch (error) {
    console.error(`Error navigating to ${url}:`, error);
  }
}

/**
 * Wait for an element to appear in the DOM
 * @param selector CSS selector for the element to wait for
 * @param timeout Maximum time to wait in milliseconds
 * @returns Promise resolving to the element if found, null if timeout
 */
export async function waitForElement(selector: string, timeout = 5000): Promise<Element | null> {
  return new Promise(resolve => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      const element = document.querySelector(selector);
      if (element) {
        clearInterval(checkInterval);
        resolve(element);
      } else if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval);
        resolve(null);
      }
    }, 100);
  });
}

/**
 * Extract text content from an element
 * @param selector CSS selector for the target element
 * @returns Promise resolving to the text content or empty string if element not found
 */
export async function extractText(selector: string): Promise<string> {
  try {
    const element = document.querySelector(selector);
    return element ? element.textContent?.trim() || '' : '';
  } catch (error) {
    console.error(`Error extracting text from ${selector}:`, error);
    return '';
  }
}

/**
 * Check if an element exists in the DOM
 * @param selector CSS selector for the element to check
 * @returns Promise resolving to true if element exists, false otherwise
 */
export async function elementExists(selector: string): Promise<boolean> {
  try {
    return document.querySelector(selector) !== null;
  } catch (error) {
    console.error(`Error checking if element exists ${selector}:`, error);
    return false;
  }
}

/**
 * Find all elements matching a selector and return their text content
 * @param selector CSS selector for the elements to find
 * @returns Promise resolving to array of text content from matching elements
 */
export async function findAllElements(selector: string): Promise<string[]> {
  try {
    const elements = document.querySelectorAll(selector);
    return Array.from(elements).map(el => el.textContent?.trim() || '');
  } catch (error) {
    console.error(`Error finding elements ${selector}:`, error);
    return [];
  }
}

/**
 * Submit a form
 * @param selector CSS selector for the form element
 * @returns Promise resolving to true if submission was successful, false otherwise
 */
export async function submitForm(selector: string): Promise<boolean> {
  try {
    const form = document.querySelector(selector);
    if (form instanceof HTMLFormElement) {
      form.submit();
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error submitting form ${selector}:`, error);
    return false;
  }
}

/**
 * Focus on an element
 * @param selector CSS selector for the element to focus
 * @returns Promise resolving to true if focus was successful, false otherwise
 */
export async function focusElement(selector: string): Promise<boolean> {
  try {
    const element = document.querySelector(selector);
    if (element instanceof HTMLElement) {
      element.focus();
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error focusing element ${selector}:`, error);
    return false;
  }
}

/**
 * Get attributes of an element
 * @param selector CSS selector for the target element
 * @param attributeNames Array of attribute names to retrieve
 * @returns Promise resolving to object with attribute name-value pairs
 */
export async function getElementAttributes(
  selector: string, 
  attributeNames: string[]
): Promise<Record<string, string>> {
  try {
    const element = document.querySelector(selector);
    if (!element) return {};
    
    const attributes: Record<string, string> = {};
    attributeNames.forEach(attr => {
      const value = element.getAttribute(attr);
      if (value !== null) {
        attributes[attr] = value;
      }
    });
    
    return attributes;
  } catch (error) {
    console.error(`Error getting attributes from ${selector}:`, error);
    return {};
  }
} 