import { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { identifyMainContent, classifyContent, ContentClassification } from '@browserai/browserai';

export function ContentIdentifierTest() {
  const [pageContent, setPageContent] = useState<string>('');
  const [mainContent, setMainContent] = useState<string>('');
  const [classification, setClassification] = useState<ContentClassification | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [status, setStatus] = useState<string>('');

  // Get the active tab when component mounts
  useEffect(() => {
    const getActiveTab = async () => {
      try {
        console.log('Attempting to get active tab...');
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        console.log('Active tabs query result:', tabs);
        
        if (tabs[0]?.id) {
          console.log('Setting active tab ID:', tabs[0].id);
          setActiveTabId(tabs[0].id);
        } else {
          console.warn('No active tab ID found in query result');
        }
      } catch (error) {
        console.error('Error getting active tab:', error);
        setStatus('Error: Could not access active tab');
      }
    };

    console.log('Component mounted, getting active tab...');
    getActiveTab();
  }, []);

  // Function to extract text content from the active tab
  const extractPageContent = async () => {
    console.log('extractPageContent called, activeTabId:', activeTabId);
    
    if (!activeTabId) {
      console.error('No active tab ID available');
      setStatus('Error: No active tab found');
      return '';
    }

    setIsLoading(true);
    setStatus('Extracting page content...');

    try {
      // Get the current tab's URL
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentUrl = tabs[0]?.url;
      
      if (!currentUrl) {
        setStatus('Error: Could not determine current URL');
        return '';
      }
      
      console.log('Current URL:', currentUrl);
      
      // Request permission for this specific host
      const urlObj = new URL(currentUrl);
      const hostPermission = `${urlObj.protocol}//${urlObj.hostname}/*`;
      
      console.log('Requesting permission for:', hostPermission);
      setStatus(`Requesting permission for: ${urlObj.hostname}`);
      
      const granted = await chrome.permissions.request({
        permissions: ['scripting'],
        origins: [hostPermission]
      });
      
      if (!granted) {
        console.error('Permission not granted');
        setStatus('Error: Permission not granted for this website');
        setIsLoading(false);
        return '';
      }
      
      console.log('Permission granted, extracting content...');
      setStatus('Permission granted, extracting content...');

      // First, inject a content script that will send a message back with the page content
      await chrome.scripting.executeScript({
        target: { tabId: activeTabId },
        func: () => {
          // This function runs in the context of the web page
          console.log('Content script injected and running');
          
          // Get the page content
          const pageContent = document.body.innerText || document.body.textContent || '';
          console.log('Page content length:', pageContent.length);
          
          // Send the content back to the extension
          chrome.runtime.sendMessage({
            action: 'pageContent',
            content: pageContent,
            url: window.location.href,
            title: document.title
          });
          
          // Also log to the page console
          console.log('Message sent to extension with content length:', pageContent.length);
          
          // Return something to confirm execution
          return { success: true, contentLength: pageContent.length };
        }
      });
      
      console.log('Script injected, waiting for content message...');
      
      // Set up a listener for the message
      const contentPromise = new Promise<string>((resolve) => {
        const messageListener = (message: { action: string, content: string, url: string, title: string }) => {
          if (message.action === 'pageContent') {
            console.log('Received page content message:', {
              contentLength: message.content?.length,
              url: message.url,
              title: message.title
            });
            
            chrome.runtime.onMessage.removeListener(messageListener);
            resolve(message.content || '');
          }
        };
        
        chrome.runtime.onMessage.addListener(messageListener);
        
        // Set a timeout to resolve with empty string if no message is received
        setTimeout(() => {
          chrome.runtime.onMessage.removeListener(messageListener);
          console.warn('Timeout waiting for content message');
          resolve('');
        }, 5000);
      });
      
      // Wait for the content
      const extractedText = await contentPromise;
      
      // As a fallback, try a direct approach
      if (!extractedText) {
        console.log('No message received, trying direct approach...');
        
        const directResult = await chrome.scripting.executeScript({
          target: { tabId: activeTabId },
          func: () => document.body.innerText || document.body.textContent || ''
        });
        
        const directText = directResult?.[0]?.result || '';
        console.log('Direct extraction result length:', directText.length);
        
        if (directText) {
          setPageContent(directText);
          setStatus(`Content extracted directly (${directText.length} characters)`);
          return directText;
        }
      } else {
        setPageContent(extractedText);
        setStatus(`Content extracted via message (${extractedText.length} characters)`);
        return extractedText;
      }
      
      // If we got here, both approaches failed
      setStatus('Error: Failed to extract content from page');
      return '';
    } catch (error) {
      console.error('Error extracting content:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
      return '';
    } finally {
      setIsLoading(false);
    }
  };

  // Function to highlight elements on the page
  const highlightElements = async (contentType: ContentClassification['type']) => {
    if (!activeTabId) {
      setStatus('Error: No active tab found');
      return;
    }

    setIsLoading(true);
    setStatus(`Highlighting ${contentType} elements...`);

    try {
      // Enhanced selectors based on content type
      let selectors: Array<{ selector: string, label: string }> = [];
      
      switch (contentType) {
        case 'article':
          selectors = [
            { selector: 'article', label: 'Article Content' },
            { selector: 'main', label: 'Main Content' },
            { selector: '.content, .post, .article', label: 'Article Section' },
            { selector: 'h1, h2, h3', label: 'Heading' },
            { selector: '.post-content, .article-body', label: 'Article Body' }
          ];
          break;
        case 'product':
          selectors = [
            { selector: '.product, .item', label: 'Product' },
            { selector: '.price, [data-price]', label: 'Price' },
            { selector: '.buy, .add-to-cart, button[type="submit"]', label: 'Purchase Button' },
            { selector: '.product-description', label: 'Product Description' },
            { selector: '.product-image, .gallery', label: 'Product Images' }
          ];
          break;
        case 'form':
          selectors = [
            { selector: 'form', label: 'Form' },
            { selector: 'input[type="text"]', label: 'Text Input' },
            { selector: 'input[type="email"]', label: 'Email Input' },
            { selector: 'select', label: 'Dropdown' },
            { selector: 'textarea', label: 'Text Area' },
            { selector: 'button[type="submit"]', label: 'Submit Button' },
            { selector: '.form-group, .input-group', label: 'Form Group' }
          ];
          break;
        case 'navigation':
          selectors = [
            { selector: 'nav', label: 'Navigation' },
            { selector: '.menu, .navbar', label: 'Menu' },
            { selector: 'header a', label: 'Header Link' },
            { selector: 'footer a', label: 'Footer Link' },
            { selector: '.navigation, .nav-links', label: 'Navigation Links' }
          ];
          break;
        default:
          selectors = [
            { selector: 'p', label: 'Paragraph' },
            { selector: 'button', label: 'Button' },
            { selector: 'a', label: 'Link' },
            { selector: '.content', label: 'Content' },
            { selector: 'img', label: 'Image' }
          ];
      }

      await chrome.scripting.executeScript({
        target: { tabId: activeTabId },
        func: (selectors) => {
          // Remove existing highlights and tooltips
          document.querySelectorAll('.ai-content-highlight, .ai-tooltip').forEach(el => el.remove());
          
          // Create tooltip styles if they don't exist
          if (!document.getElementById('ai-tooltip-styles')) {
            const style = document.createElement('style');
            style.id = 'ai-tooltip-styles';
            style.textContent = `
              .ai-tooltip {
                position: absolute;
                background: #333;
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                z-index: 10000;
                pointer-events: none;
                transform: translate(-50%, -100%);
                margin-top: -8px;
              }
            `;
            document.head.appendChild(style);
          }

          let highlightedCount = 0;
          
          selectors.forEach(({ selector, label }) => {
            try {
              document.querySelectorAll(selector).forEach(element => {
                const htmlElement = element as HTMLElement;
                
                // Skip if element is not visible
                const rect = htmlElement.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) return;
                
                // Create highlight effect
                htmlElement.style.outline = '2px solid #4CAF50';
                htmlElement.style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
                htmlElement.classList.add('ai-content-highlight');
                
                // Create and position tooltip
                const tooltip = document.createElement('div');
                tooltip.className = 'ai-tooltip';
                tooltip.textContent = label;
                document.body.appendChild(tooltip);
                
                // Position tooltip above element
                const elementRect = htmlElement.getBoundingClientRect();
                tooltip.style.left = elementRect.left + (elementRect.width / 2) + 'px';
                tooltip.style.top = elementRect.top + window.scrollY + 'px';
                
                // Scroll first element into view
                if (highlightedCount === 0) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                
                highlightedCount++;
              });
            } catch (e) {
              console.error(`Error with selector ${selector}:`, e);
            }
          });
          
          return highlightedCount;
        },
        args: [selectors]
      });

      setStatus(`Highlighted ${contentType} elements with labels`);
    } catch (error) {
      console.error('Error highlighting elements:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Function to process the content
  const processContent = async () => {
    console.log('processContent called, current pageContent length:', pageContent.length);
    setIsLoading(true);
    
    try {
      // Extract content if not already done
      let content = pageContent;
      if (!content) {
        console.log('No existing content, extracting page content first...');
        setStatus('Extracting page content first...');
        content = await extractPageContent();
        console.log('Content extraction result length:', content?.length || 0);
      }
      
      if (!content) {
        console.error('No content available to process');
        setStatus('Error: No content to process. Try extracting content first.');
        setIsLoading(false);
        return;
      }
      
      // Identify main content
      console.log('Identifying main content...');
      const identified = identifyMainContent(content);
      console.log('Main content identified, length:', identified.length);
      setMainContent(identified);
      setStatus('Main content identified');
      
      // Classify the content
      console.log('Classifying content...');
      const classified = classifyContent(identified);
      console.log('Content classification result:', classified);
      setClassification(classified);
      setStatus(`Content classified as: ${classified.type} (${(classified.confidence * 100).toFixed(2)}%)`);
      
      // Highlight elements based on classification
      console.log('Highlighting elements for content type:', classified.type);
      await highlightElements(classified.type);
    } catch (error) {
      console.error('Content processing error:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      console.log('Content processing completed');
      setIsLoading(false);
    }
  };

  const resetTest = () => {
    setPageContent('');
    setMainContent('');
    setClassification(null);
    setStatus('');
    
    // Remove highlights and tooltips from the page
    if (activeTabId) {
      chrome.scripting.executeScript({
        target: { tabId: activeTabId },
        func: () => {
          document.querySelectorAll('.ai-content-highlight, .ai-tooltip').forEach(el => {
            if (el.classList.contains('ai-content-highlight')) {
              (el as HTMLElement).style.outline = '';
              (el as HTMLElement).style.backgroundColor = '';
              el.classList.remove('ai-content-highlight');
            } else {
              el.remove(); // Remove tooltips
            }
          });
        }
      }).catch(err => console.error('Error removing highlights:', err));
    }
  };

  // Add a debug button to the UI
  const debugInfo = () => {
    console.log('Debug info:');
    console.log('- Active tab ID:', activeTabId);
    console.log('- Page content length:', pageContent.length);
    console.log('- Main content length:', mainContent.length);
    console.log('- Classification:', classification);
    
    // Show in UI
    setStatus(`Debug info logged to console. Active tab: ${activeTabId}, Content length: ${pageContent.length}`);
  };

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-4">Content Identifier Test</h2>
      
      <div className="mb-4 flex space-x-2">
        <Button 
          onClick={extractPageContent}
          disabled={isLoading || !activeTabId}
          variant="outline"
        >
          Extract Page Content
        </Button>
        
        <Button 
          onClick={processContent}
          disabled={isLoading || !activeTabId}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {isLoading ? 'Processing...' : 'Analyze & Highlight Content'}
        </Button>
        
        <Button 
          onClick={resetTest}
          variant="outline"
          disabled={isLoading}
        >
          Reset
        </Button>
        
        <Button 
          onClick={debugInfo}
          variant="outline"
        >
          Debug Info
        </Button>
      </div>
      
      {status && (
        <div className="mb-4 p-2 bg-blue-50 border border-blue-200 rounded">
          <p className="text-sm text-blue-700">
            <span className="font-medium">Status:</span> {status}
          </p>
        </div>
      )}
      
      {classification && (
        <div className="mb-4">
          <h3 className="text-md font-medium mb-2">Content Classification:</h3>
          <div className="p-3 border rounded bg-gray-50">
            <div className="mb-2">
              <span className="font-medium">Type:</span> {classification.type}
            </div>
            <div className="mb-2">
              <span className="font-medium">Confidence:</span> {(classification.confidence * 100).toFixed(2)}%
            </div>
            <div className="mb-2">
              <span className="font-medium">Keywords:</span> {classification.keywords.join(', ')}
            </div>
            <div>
              <span className="font-medium">Entities:</span> {classification.entities.length > 0 ? classification.entities.join(', ') : 'None detected'}
            </div>
          </div>
        </div>
      )}
      
      {mainContent && (
        <div className="mb-4">
          <h3 className="text-md font-medium mb-2">Identified Main Content (Preview):</h3>
          <div className="p-3 border rounded bg-black text-white max-h-60 overflow-auto">
            <pre className="whitespace-pre-wrap text-sm">{mainContent.slice(0, 500)}
              {mainContent.length > 500 ? '...' : ''}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
} 