import React from 'react';
import { Bot, User, Brain } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'framer-motion';

interface ChatMessageProps {
  isAi: boolean;
  message: string;
  status?: 'thinking' | 'generating' | 'speaking' | null;
}

export function ChatMessage({ isAi, message, status }: ChatMessageProps) {
  return (
    <div className={`flex gap-3 ${isAi ? 'justify-start' : 'justify-end'}`}>
      {isAi && (
        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
          <Brain className="w-5 h-5 text-blue-400" />
        </div>
      )}
      
      <div className="flex-1 max-w-[80%]">
        {isAi ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="relative bg-blue-500/10 rounded-lg p-4"
          >
            {/* Thinking animation */}
            {status === 'thinking' && (
              <div className="flex items-center gap-2">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="w-2 h-2 bg-blue-400 rounded-full"
                />
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                  className="w-2 h-2 bg-blue-400 rounded-full"
                />
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                  className="w-2 h-2 bg-blue-400 rounded-full"
                />
              </div>
            )}

            {/* Message text with typing animation when speaking */}
            {message && (
              <p className="text-base text-white/90 leading-relaxed">
                {status === 'speaking' ? (
                  message.split('').map((char, idx) => (
                    <motion.span
                      key={idx}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.02 }}
                    >
                      {char}
                    </motion.span>
                  ))
                ) : (
                  message
                )}
              </p>
            )}

            {/* Status indicator */}
            {status && status !== 'thinking' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-2 text-sm text-blue-400/80 flex items-center gap-2"
              >
                {status === 'speaking' ? (
                  <>
                    <div className="flex gap-1 items-center">
                      {[...Array(4)].map((_, i) => (
                        <motion.div
                          key={i}
                          className="w-0.5 bg-blue-400/80"
                          animate={{
                            height: ["8px", "16px", "8px"],
                          }}
                          transition={{
                            duration: 0.8,
                            repeat: Infinity,
                            delay: i * 0.2,
                          }}
                        />
                      ))}
                    </div>
                    <span>Speaking...</span>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 rounded-full bg-blue-400/80 animate-pulse" />
                    {status === 'generating' && 'Generating response...'}
                  </>
                )}
              </motion.div>
            )}
          </motion.div>
        ) : (
          <div className="bg-white/10 rounded-lg p-4">
            <p className="text-base text-white/90">{message}</p>
          </div>
        )}
      </div>
    </div>
  );
}