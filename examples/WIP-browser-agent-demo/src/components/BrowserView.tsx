import { ArrowLeft, ArrowRight, RotateCw, AlertCircle } from 'lucide-react';
import { useState, useEffect } from 'react';

const EXAMPLE_SITES = [
  'https://example.com',
  'https://www.wikipedia.org',
  'https://stackblitz.com',
  'https://codesandbox.io'
];

interface BrowserViewProps {
  url: string;
  onUrlChange: (url: string) => void;
}

export default function BrowserView({ url, onUrlChange }: BrowserViewProps) {
  const [iframeError, setIframeError] = useState(false);

  useEffect(() => {
    setIframeError(false);
  }, [url]);

  const handleIframeError = () => {
    setIframeError(true);
  };

  const handleReload = () => {
    onUrlChange(url); // Trigger a reload by setting the same URL
  };

  return (
    <div className="flex-1 flex flex-col w-full">
      <div className="p-4 bg-white border-b border-gray-200">
        <div className="flex items-center gap-2">
          <button className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <button className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowRight className="w-5 h-5 text-gray-600" />
          </button>
          <button
            onClick={handleReload}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RotateCw className="w-5 h-5 text-gray-600" />
          </button>
          <input
            type="text"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            className="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="flex-1 relative">
        <iframe
          src={url}
          className="w-full h-full border-none"
          title="Web Content"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          onError={handleIframeError}
        />
        {iframeError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
            <div className="text-center p-8 max-w-md">
              <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Unable to Load Website</h3>
              <p className="text-gray-600">
                This website cannot be displayed due to security restrictions. Try visiting one of our example sites that allow embedding:
              </p>
              <div className="mt-4 space-y-2">
                {EXAMPLE_SITES.map((site, index) => (
                  <button
                    key={index}
                    onClick={() => onUrlChange(site)}
                    className="block w-full p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    {site}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}