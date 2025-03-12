console.log('Content script loaded!');

// Create and inject the floating button
function createFloatingButton() {
  const button = document.createElement('button');
  button.innerHTML = '🤖'; // You can replace this with an SVG icon
  button.className = 'floating-button';

  button.addEventListener('click', () => {
    console.log('Button clicked!');
    chrome.runtime.sendMessage({ action: 'openSidePanel' });
  });

  document.body.appendChild(button);
}

createFloatingButton();

// Listen for the custom event
window.addEventListener('workflowData', function(event) {
    // Forward the data to the background script
    chrome.runtime.sendMessage({
        action: 'workflowDataReceived',
        data: event.detail
    });
});

// Listen for action execution messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'executeAction') {
    // Import the executor dynamically
    import(chrome.runtime.getURL('src/core/browser-actions.js'))
      .then(module => {
        return module.executeAction({
          type: request.type,
          params: request.params
        });
      })
      .then(result => {
        sendResponse({ success: true, result });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Required for async sendResponse
  }
}); 