import ChatInterface from './components/ChatInterface'
import EnhancedChatInterface from './components/EnhancedChatInterface'
import React, { StrictMode } from 'react'

function App() {
  return (
    <ChatInterface>
      {(props) => <EnhancedChatInterface {...props} />}
    </ChatInterface>
  );
}

export default App;
