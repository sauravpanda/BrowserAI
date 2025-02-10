import React from 'react';
import { Github, Lock, Code, Heart, MessageCircle, Bot, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';

export function InfoBanner() {
  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="fixed right-4 top-1/4 -translate-y-1/4 w-72 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-lg p-4 backdrop-blur-sm border border-white/10"
      >
        <h3 className="text-lg font-semibold text-white/90 mb-3 flex items-center gap-2">
          <Code className="w-5 h-5" />
          Build with Browser AI
        </h3>
        
        <div className="space-y-4">
          <div className="flex items-start gap-2">
            <Lock className="w-4 h-4 text-green-400 mt-1" />
            <p className="text-sm text-white/80">
              All models run locally in your browser with full privacy and zero cost
            </p>
          </div>

          <div className="flex items-start gap-2">
            <Code className="w-4 h-4 text-blue-400 mt-1" />
            <p className="text-sm text-white/80">
              Integrate these models with just a few lines of code
            </p>
          </div>

          <div className="flex items-start gap-2">
            <Heart className="w-4 h-4 text-red-400 mt-1" />
            <p className="text-sm text-white/80">
              Join our open-source community and help make AI accessible to everyone
            </p>
          </div>

          <div className="flex gap-2">
            <a 
              href="https://github.com/browser-ai/browser-ai" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 text-sm text-white/90 bg-white/10 hover:bg-white/20 transition-colors rounded-md px-3 py-2"
            >
              <Github className="w-4 h-4" />
              GitHub
            </a>
            
            <a 
              href="https://discord.gg/browserai" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 text-sm text-white/90 bg-white/10 hover:bg-white/20 transition-colors rounded-md px-3 py-2"
            >
              <MessageCircle className="w-4 h-4" />
              Discord
            </a>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2 }}
        className="fixed right-4 top-3/4 -translate-y-1/3 w-72 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-lg p-4 backdrop-blur-sm border border-white/10"
      >
        <h3 className="text-lg font-semibold text-white/90 mb-3 flex items-center gap-2">
          <Bot className="w-5 h-5" />
          Build Your Own Agents
        </h3>
        
        <p className="text-sm text-white/80 mb-4">
          Create custom AI agents that run entirely in the browser. Build powerful, private, and cost-effective AI solutions with BrowserAgent.
        </p>

        <a 
          href="https://browseragent.dev" 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 text-sm text-white/90 bg-white/10 hover:bg-white/20 transition-colors rounded-md px-3 py-2 w-full"
        >
          <ExternalLink className="w-4 h-4" />
          Try BrowserAgent Today
        </a>
      </motion.div>
    </>
  );
} 