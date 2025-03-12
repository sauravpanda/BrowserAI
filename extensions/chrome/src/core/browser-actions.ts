import {
  clickElement,
  fillInput,
  selectOption,
  scrollPage,
  navigateTo,
  waitForElement,
  extractText,
  elementExists,
  findAllElements,
  submitForm,
  focusElement,
  getElementAttributes
} from '@browserai/browserai';

/**
 * Executes browser actions based on the provided action type and parameters
 * @param action The action to execute
 * @returns Promise resolving to the result of the action
 */
export async function executeAction(action: {
  type: string;
  params: Record<string, any>;
}): Promise<any> {
  const { type, params } = action;
  
  try {
    switch (type) {
      case 'click':
        return await clickElement(params.selector);
      
      case 'fill':
        return await fillInput(params.selector, params.value);
      
      case 'select':
        return await selectOption(params.selector, params.value);
      
      case 'scroll':
        return await scrollPage({
          direction: params.direction as "up" | "down",
          amount: params.amount as number
        });
      
      case 'navigate':
        return await navigateTo(params.url);
      
      case 'waitFor':
        return await waitForElement(params.selector, params.timeout);
      
      case 'extractText':
        return await extractText(params.selector);
      
      case 'checkExists':
        return await elementExists(params.selector);
      
      case 'findAll':
        return await findAllElements(params.selector);
      
      case 'submitForm':
        return await submitForm(params.selector);
      
      case 'focus':
        return await focusElement(params.selector);
      
      case 'getAttributes':
        return await getElementAttributes(params.selector, params.attributeNames);
      
      default:
        throw new Error(`Unknown action type: ${type}`);
    }
  } catch (error) {
    console.error(`Error executing action ${type}:`, error);
    throw error;
  }
} 