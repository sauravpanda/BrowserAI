import { useState, useEffect } from 'react';
import { HTMLCleaner } from '@browserai/browserai';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Textarea } from './ui/textarea';

export function HTMLCleanerTest() {
  const [originalHtml, setOriginalHtml] = useState<string>('');
  const [cleanedHtml, setCleanedHtml] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Get the HTML of the current page
  const getCurrentPageHtml = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Query the active tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]?.id) {
        throw new Error('No active tab found');
      }
      
      // Execute script to get the HTML
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => document.documentElement.outerHTML
      });
      
      const html = results[0]?.result as string;
      setOriginalHtml(html);
    } catch (err) {
      setError(`Error getting page HTML: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };
  
  // Clean the HTML
  const cleanHtml = () => {
    try {
      const htmlCleaner = new HTMLCleaner();
      const cleaned = htmlCleaner.cleanForLLM(originalHtml, { ignoreLinks: true });
      console.log(cleaned);
      setCleanedHtml(cleaned);
    } catch (err) {
      setError(`Error cleaning HTML: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  
  // Effect to get the HTML when the component mounts
  useEffect(() => {
    getCurrentPageHtml();
  }, []);
  
  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">HTML Cleaner Test</h2>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={getCurrentPageHtml}
            disabled={loading}
          >
            Refresh HTML
          </Button>
          <Button 
            variant="default" 
            size="sm" 
            onClick={cleanHtml}
            disabled={loading || !originalHtml}
          >
            Clean HTML
          </Button>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}
      
      <Tabs defaultValue="original">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="original">Original HTML</TabsTrigger>
          <TabsTrigger value="cleaned">Cleaned HTML</TabsTrigger>
        </TabsList>
        <TabsContent value="original" className="mt-2">
          <Textarea 
            value={originalHtml} 
            onChange={(e) => setOriginalHtml(e.target.value)}
            className="h-[400px] font-mono text-xs"
            placeholder={loading ? "Loading HTML..." : "No HTML content"}
          />
        </TabsContent>
        <TabsContent value="cleaned" className="mt-2">
          <Textarea 
            value={cleanedHtml} 
            readOnly
            className="h-[400px] font-mono text-xs"
            placeholder="Cleaned HTML will appear here"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
} 