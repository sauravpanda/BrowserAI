// Remove the import and use a bundled version of base64-js functions
const base64js = {
    toByteArray(base64String) {
        const binString = atob(base64String);
        return Uint8Array.from(binString, (m) => m.codePointAt(0));
    }
};

// Toggle side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  console.log('Extension icon clicked');
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Validate sender origin for sensitive operations
  if (!sender.url?.startsWith('https://app.browseragent.dev')) {
    console.error('Invalid sender origin');
    return;
  }

  console.log('Received message:', message);
  if (message.action === 'openSidePanel') {
    console.log('Opening side panel');
    chrome.sidePanel.open({ windowId: sender.tab.windowId });
  }
  if (message.action === 'refreshWorkflows') {
    chrome.tabs.create({ url: "https://app.browseragent.dev/dashboard/chrome-extension" });
    sendResponse({ status: "opening sync tab" });
    return true;
  }
  if (message.action === 'workflowDataReceived') {
    console.log('Processing workflow data:', message.data);
    const data = message.data;
    
    if (!data.encryptedWorkflowData) {
        console.error("No workflow data received");
        chrome.tabs.remove(sender.tab.id);
        return;
    }

    const encryptedDataB64 = data.encryptedWorkflowData;
    const encryptionKeyB64 = data.encryptionKey;
    const ivB64 = data.iv;
    const expiryTimestamp = data.expiryTimestamp;

    // Convert base64 strings to byte arrays
    const encryptionKeyRaw = Uint8Array.from(atob(encryptionKeyB64), c => c.charCodeAt(0));
    const encryptedDataRaw = Uint8Array.from(atob(encryptedDataB64), c => c.charCodeAt(0));
    const ivRaw = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));

    crypto.subtle.importKey("raw", encryptionKeyRaw, { name: "AES-CBC", length: 256 }, false, ["decrypt"])
        .then(key => crypto.subtle.decrypt({ name: "AES-CBC", iv: ivRaw }, key, encryptedDataRaw))
        .then(decryptedData => {
            const decoder = new TextDecoder();
            const workflowData = JSON.parse(decoder.decode(decryptedData));
            
            // Store the complete workflow data including content
            chrome.storage.local.set({
                workflowsData: workflowData.workflows.reduce((acc, workflow) => {
                    acc[workflow.id] = workflow;
                    return acc;
                }, {}),
                workflowsList: workflowData.workflows.map(({ id, name, description, type }) => ({
                    id, name, description, type
                })),
                encryptionKey: encryptionKeyB64,
                expiryTimestamp: expiryTimestamp
            }, () => {
                chrome.runtime.sendMessage({ 
                    action: 'workflowsUpdated', 
                    workflows: workflowData.workflows.map(({ id, name, description, type }) => ({
                        id, name, description, type
                    }))
                });
                chrome.tabs.remove(sender.tab.id);
            });
        })
        .catch(error => {
            console.error("Decryption or storage failed:", error);
            chrome.tabs.remove(sender.tab.id);
        });

    // Clear sensitive data after expiry
    const clearData = () => {
      chrome.storage.local.remove([
        'workflowsData',
        'encryptionKey',
        'expiryTimestamp'
      ]);
    };
    
    setTimeout(clearData, expiryTimestamp - Date.now());
  }

  // Add a handler for getting specific workflow data
  if (message.action === 'getWorkflowData') {
    chrome.storage.local.get(['workflowsData'], function(result) {
        const workflowData = result.workflowsData?.[message.workflowId];
        sendResponse({ workflowData });
    });
    return true;
  }

  if (message.action === 'getWorkflows') {
    chrome.storage.local.get(['workflowsList', 'expiryTimestamp'], function(result) {
        const now = Date.now();
        if (result.expiryTimestamp && now > result.expiryTimestamp) {
            chrome.storage.local.remove(['workflowsList', 'workflowsData', 'encryptionKey', 'expiryTimestamp']);
            sendResponse({ workflows: [] });
        } else {
            sendResponse({ workflows: result.workflowsList || [] });
        }
    });
    return true;
  }
}); 

