import { useState, useEffect, useRef } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Send } from 'lucide-react';
import { BrowserAI } from '@browserai/browserai';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../components/ui/select";

interface Message {
    text: string;
    sender: 'user' | 'bot';
}

export function ChatInterface() {
    const [browserAI] = useState(new BrowserAI());
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [modelLoaded, setModelLoaded] = useState(false);
    const [loading, setLoading] = useState(false);
    const [selectedModel, setSelectedModel] = useState('smollm2-135m-instruct');
    const [memoryUsage, setMemoryUsage] = useState('0 \n/ 0 MB');
    const [loadingProgress, setLoadingProgress] = useState(0);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [availableMemory, setAvailableMemory] = useState(0);

    const loadModel = async () => {
        setLoading(true);
        try {
            await browserAI.loadModel(selectedModel, {
                onProgress: (progress: any) => {
                    const progressPercent = progress.progress || 0;
                    setLoadingProgress(progressPercent * 100);
                }
            });
            setModelLoaded(true);
        } catch (error) {
            console.error('Error loading model:', error);
        }
        setLoading(false);
        setLoadingProgress(0);
    };

    const handleSend = async () => {
        if (!input.trim() || !modelLoaded) return;

        const userMessage: Message = { text: input, sender: 'user' };
        setMessages(prev => [...prev, userMessage]);
        setInput('');

        try {
            const chunks = await browserAI.generateText(input, {
                max_tokens: 4096,
                temperature: 0.6,
                frequency_penalty: 0.5,
                presence_penalty: 0.5,
                stream: true,
            });

            let response = '';
            for await (const chunk of chunks as AsyncIterable<{
                choices: Array<{ delta: { content?: string } }>,
                usage: any
            }>) {
                const newContent = chunk.choices[0]?.delta.content || '';
                response += newContent;
                setMessages(prevMessages => {
                    const updatedMessages = [...prevMessages];
                    if (updatedMessages[updatedMessages.length - 1]?.sender === 'bot') {
                        updatedMessages[updatedMessages.length - 1].text = response;
                    } else {
                        updatedMessages.push({ text: response, sender: 'bot' });
                    }
                    return updatedMessages;
                });
            }
        } catch (error) {
            console.error('Error generating response:', error);
            setMessages(prev => [...prev, { text: 'Error generating response', sender: 'bot' }]);
        }
    };

    useEffect(() => {
        const updateMemoryUsage = () => {
            if ('performance' in window && 'memory' in performance) {
                const memory = (performance as any).memory;
                const used = (memory.usedJSHeapSize / (1024 * 1024)).toFixed(1);
                const total = (memory.jsHeapSizeLimit / (1024 * 1024)).toFixed(1);
                setMemoryUsage(`${used} / ${total} MB`);
            }
        };

        const interval = setInterval(updateMemoryUsage, 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        // Check available memory on component mount
        if ('performance' in window && 'memory' in performance) {
            const memory = (performance as any).memory;
            const totalMemoryMB = memory.jsHeapSizeLimit / (1024 * 1024);
            setAvailableMemory(totalMemoryMB);
        }
    }, []);

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Header with model selection and stats */}
            <div className="p-4 flex flex-col space-y-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                {/* Model selector and Load button */}
                <div className="flex items-center justify-between gap-4">
                    <Select value={selectedModel} onValueChange={setSelectedModel}>
                        <SelectTrigger className="w-[220px] select-trigger bg-background hover:bg-background">
                            <SelectValue placeholder="Select model" />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-gray-950 border-gray-200/50 dark:border-gray-800 border">
                            <SelectItem value="smollm2-1.7b-instruct" className="dropdown-button">SmolLM2 1.7B Instruct</SelectItem>
                            <SelectItem value="qwen2.5-1.5b-instruct" className="dropdown-button">Qwen 2.5 1.5B Instruct</SelectItem>
                            <SelectItem value="llama-3.2-1b-instruct" className="dropdown-button">Llama 3.2 1B Instruct</SelectItem>
                            <SelectItem value="qwen2.5-0.5b-instruct" className="dropdown-button">Qwen 2.5 0.5B Instruct</SelectItem>
                            <SelectItem 
                                value="deepseek-r1-distill-qwen-7b" 
                                disabled={availableMemory < 2000}
                                className="dropdown-button"
                            >
                                DeepSeek R1 Distill Qwen 7B (HIGH MEMORY)
                                {availableMemory < 2000 && " - Insufficient Memory"}
                            </SelectItem>
                            <SelectItem 
                                value="deepseek-r1-distill-llama-8b"
                                disabled={availableMemory < 2000}
                                className="dropdown-button"
                            >
                                DeepSeek R1 Distill Llama 8B (HIGH MEMORY)
                                {availableMemory < 2000 && " - Insufficient Memory"}
                            </SelectItem>
                            <SelectItem 
                                value="phi-3.5-mini-instruct"
                                disabled={availableMemory < 2000}
                                className="dropdown-button"
                            >
                                Phi 3.5 Mini Instruct (HIGH MEMORY)
                                {availableMemory < 2000 && " - Insufficient Memory"}
                            </SelectItem>
                            <SelectItem value="smollm2-135m-instruct" className="dropdown-button">SmolLM2 135M Instruct</SelectItem>
                            <SelectItem value="smollm2-360m-instruct" className="dropdown-button">SmolLM2 360M Instruct</SelectItem>
                            <SelectItem value="gemma-2b-it" className="dropdown-button">Gemma 2B IT</SelectItem>
                            <SelectItem value="tinyllama-1.1b-chat-v0.4" className="dropdown-button">TinyLlama 1.1B Chat</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button
                        variant={modelLoaded ? "secondary" : "default"}
                        onClick={loadModel}
                        disabled={loading}
                        className="ml-auto"
                    >
                        {loading ? "Loading..." : modelLoaded ? "Loaded" : "Load Model"}
                    </Button>
                </div>

                {/* Memory usage stats */}
                <div className="text-xs text-muted-foreground text-left pl-1">
                    {memoryUsage}
                </div>
            </div>

            {/* Add progress bar */}
            {loading && (
                <div className="w-full bg-secondary rounded-full h-2">
                    <div 
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{ width: `${loadingProgress}%` }}
                    />
                </div>
            )}

            {/* Messages area */}
            <div className="flex-1 overflow-auto p-4 space-y-4 bg-background">
                {messages.map((message, index) => (
                    <div
                        key={index}
                        className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`max-w-[80%] rounded-2xl py-2 px-4 text-left ${
                                message.sender === 'user'
                                    ? 'border border-gray-200 dark:border-gray-800 text-foreground'
                                    : 'bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-foreground'
                            }`}
                            style={{
                                borderBottomRightRadius: message.sender === 'user' ? '4px' : '16px',
                                borderBottomLeftRadius: message.sender === 'bot' ? '4px' : '16px',
                            }}
                        >
                            {message.text}
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="p-4 bg-background">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleSend();
                    }}
                    className="flex space-x-2"
                >
                    <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={modelLoaded ? "Type a message..." : "Please load a model first"}
                        className="flex-1 bg-background text-foreground"
                        disabled={!modelLoaded}
                    />
                    <Button type="submit" size="icon" disabled={!modelLoaded}>
                        <Send className="h-4 w-4" />
                        <span className="sr-only">Send message</span>
                    </Button>
                </form>
            </div>
        </div>
    );
} 