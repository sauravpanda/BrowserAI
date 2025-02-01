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