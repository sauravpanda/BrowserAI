import { useState } from 'react';
import { Button } from '../components/ui/button';

export function WorkflowRunner() {
  const [result, setResult] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [nextStep, setNextStep] = useState<string>('');
  const [workflowSteps, setWorkflowSteps] = useState<Array<() => Promise<void>>>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1);
  const [workflowStarted, setWorkflowStarted] = useState(false);

  // Function to highlight an element
  const highlightElement = async (selector: string) => {
    setCurrentStep(`Highlighting: ${selector}`);
    
    try {
      // Get the active tab
      const tabId = Number(sessionStorage.getItem('workflowTabId'));
      if (!tabId) return;
      
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (selector) => {
          const element = document.querySelector(selector);
          if (!element) return false;
          
          // Cast to HTMLElement to access style property
          const htmlElement = element as HTMLElement;
          
          // Create highlight effect
          const originalOutline = htmlElement.style.outline;
          const originalZIndex = htmlElement.style.zIndex;
          const originalPosition = htmlElement.style.position;
          
          htmlElement.style.outline = '3px solid #ff5722';
          htmlElement.style.zIndex = '9999';
          if (window.getComputedStyle(element).position === 'static') {
            htmlElement.style.position = 'relative';
          }
          
          // Scroll element into view
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Remove highlight after 1.5 seconds
          setTimeout(() => {
            htmlElement.style.outline = originalOutline;
            htmlElement.style.zIndex = originalZIndex;
            htmlElement.style.position = originalPosition;
          }, 1500);
          
          return true;
        },
        args: [selector]
      });
    } catch (error) {
      console.error('Failed to highlight element:', error);
    }
  };

  const executeNextStep = async () => {
    if (currentStepIndex < workflowSteps.length - 1) {
      const nextIndex = currentStepIndex + 1;
      setCurrentStepIndex(nextIndex);
      setIsLoading(true);
      
      try {
        await workflowSteps[nextIndex]();
        
        if (nextIndex < workflowSteps.length - 1) {
          setNextStep(`Next: ${getStepDescription(nextIndex + 1)}`);
        } else {
          setNextStep('Workflow will complete');
        }
      } catch (error) {
        console.error('Step execution error:', error);
        setResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setIsLoading(false);
      }
    } else {
      setCurrentStep('Workflow completed');
      setNextStep('');
      setWorkflowStarted(false);
    }
  };

  const getStepDescription = (index: number): string => {
    const descriptions = [
      'Request permission for Google.com',
      'Open new tab with Google.com',
      'Highlight search input',
      'Fill search input',
      'Highlight search form',
      'Submit search',
      'Wait for search results',
      'Highlight first result',
      'Extract first result title'
    ];
    return descriptions[index] || '';
  };

  const startWorkflow = () => {
    setIsLoading(true);
    setResult('Workflow ready to start');
    console.log('Preparing workflow');
    
    // Define all workflow steps as separate functions
    const steps = [
      // Step 1: Request permission
      async () => {
        setCurrentStep('Requesting permission for Google.com');
        console.log('Requesting permission');
        
        const granted = await chrome.permissions.request({
          origins: ['https://www.google.com/*']
        });
        
        if (!granted) {
          throw new Error('Permission not granted for Google.com');
        }
      },
      
      // Step 2: Create a new tab
      async () => {
        setCurrentStep('Opening new tab');
        console.log('Opening new tab');
        const newTab = await chrome.tabs.create({ url: 'https://www.google.com' });
        const tabId = newTab.id;
        
        if (!tabId) {
          throw new Error('Failed to create new tab');
        }
        
        // Store tabId in sessionStorage for other steps to use
        sessionStorage.setItem('workflowTabId', String(tabId));
      },
      
      // Step 3: Highlight search input
      async () => {
        setCurrentStep('Highlighting search input');
        await highlightElement('input[name="q"]');
      },
      
      // Step 4: Fill the search input
      async () => {
        setCurrentStep('Filling search input');
        console.log('Filling search input');
        const tabId = Number(sessionStorage.getItem('workflowTabId'));
        
        // First highlight the element
        await highlightElement('input[name="q"]');
        
        const result = await chrome.scripting.executeScript({
          target: { tabId },
          func: (searchQuery) => {
            const input = document.querySelector('input[name="q"]') as HTMLInputElement;
            if (!input) {
              console.error('Search input not found');
              return 'Search input not found';
            }
            
            // Focus the input first
            input.focus();
            
            // Clear any existing value
            input.value = '';
            
            // Set the value directly
            input.value = searchQuery;
            
            // Create and dispatch input event
            const inputEvent = new Event('input', { bubbles: true });
            input.dispatchEvent(inputEvent);
            
            // Also dispatch a change event
            const changeEvent = new Event('change', { bubbles: true });
            input.dispatchEvent(changeEvent);
            
            // For debugging
            console.log('Input value set to:', input.value);
            
            return `Set value to: ${searchQuery}`;
          },
          args: ['Browser AI automation']
        });
        
        console.log('Fill result:', result[0]?.result);
      },
      
      // Step 5: Highlight the form
      async () => {
        setCurrentStep('Highlighting search form');
        await highlightElement('form[action="/search"]');
      },
      
      // Step 6: Submit the form
      async () => {
        setCurrentStep('Submitting search');
        console.log('Submitting search');
        const tabId = Number(sessionStorage.getItem('workflowTabId'));
        
        // First highlight the form
        await highlightElement('form[action="/search"]');
        
        await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const form = document.querySelector('form[action="/search"]') as HTMLFormElement;
            if (form) {
              form.submit();
              return true;
            }
            return false;
          }
        });
      },
      
      // Step 7: Wait for search results
      async () => {
        setCurrentStep('Waiting for search results');
        console.log('Waiting for search results');
        // This is now a manual step - user will click Next when ready
      },
      
      // Step 8: Highlight the first result
      async () => {
        setCurrentStep('Highlighting first result');
        await highlightElement('#search .g:first-child h3');
      },
      
      // Step 9: Extract the first result title
      async () => {
        setCurrentStep('Extracting first result');
        console.log('Extracting first result');
        const tabId = Number(sessionStorage.getItem('workflowTabId'));
        
        // First highlight the element
        await highlightElement('#search .g:first-child h3');
        
        const result = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const firstResult = document.querySelector('#search .g:first-child h3');
            return firstResult ? firstResult.textContent : 'No results found';
          }
        });
        
        const firstResultText = result[0]?.result || 'No text extracted';
        setResult(`First search result: ${firstResultText}`);
      }
    ];
    
    setWorkflowSteps(steps);
    setCurrentStepIndex(-1);
    setNextStep(`Next: ${getStepDescription(0)}`);
    setWorkflowStarted(true);
    setIsLoading(false);
  };

  const resetWorkflow = () => {
    setWorkflowStarted(false);
    setCurrentStepIndex(-1);
    setCurrentStep('');
    setNextStep('');
    setResult('');
    setWorkflowSteps([]);
  };

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-4">Workflow Runner</h2>
      
      {!workflowStarted ? (
        <Button 
          onClick={startWorkflow}
          disabled={isLoading}
          className="mb-4"
        >
          {isLoading ? 'Preparing...' : 'Start Google Search Workflow'}
        </Button>
      ) : (
        <div className="flex space-x-2 mb-4">
          <Button 
            onClick={executeNextStep}
            disabled={isLoading || currentStepIndex >= workflowSteps.length - 1}
            className="bg-green-600 hover:bg-green-700"
          >
            {isLoading ? 'Processing...' : 'Next Step'}
          </Button>
          <Button 
            onClick={resetWorkflow}
            variant="outline"
            disabled={isLoading}
          >
            Reset
          </Button>
        </div>
      )}
      
      {currentStep && (
        <div className="mb-4 p-2 bg-blue-50 border border-blue-200 rounded">
          <p className="text-sm text-blue-700">
            <span className="font-medium">Current step:</span> {currentStep}
          </p>
        </div>
      )}
      
      {nextStep && (
        <div className="mb-4 p-2 bg-green-50 border border-green-200 rounded">
          <p className="text-sm text-green-700">
            <span className="font-medium">{nextStep}</span>
          </p>
        </div>
      )}
      
      {result && (
        <div className="p-3 border rounded bg-gray-50">
          <pre className="whitespace-pre-wrap">{result}</pre>
        </div>
      )}
    </div>
  );
} 