import { useEffect, useState } from 'react';
import { DatabaseImpl } from '@browserai/browserai';
import { Document } from '../types';
import './DatabaseDemo.css';
import { BrowserAI } from '@browserai/browserai';

export function DatabaseDemo() {
    const [logs, setLogs] = useState<string[]>([]);
    const [db, setDb] = useState<DatabaseImpl<Document> | null>(null);
    const [inputText, setInputText] = useState('');
    const [documentId, setDocumentId] = useState('');
    const [documents, setDocuments] = useState<Document[]>([]);
    const [embeddings, setEmbeddings] = useState<BrowserAI | null>(null);

    const addLog = (message: string) => {
        setLogs(prev => [...prev, message]);
    };

    useEffect(() => {
        const initDb = async () => {
            const config = {
                databaseName: 'BrowserAI-DB',
                version: 1,
                stores: {
                    documents: { keyPath: 'id' }
                }
            };
            try {
                const database = new DatabaseImpl<Document>({ type: 'indexeddb', config });
                await database.initialize({ type: 'indexeddb', config });
                
                const browserAI = new BrowserAI();
                await browserAI.loadModel('snowflake-arctic-embed-m-b32');
                
                setDb(database);
                setEmbeddings(browserAI);
                addLog('✅ Database and embeddings initialized');
            } catch (error) {
                addLog(`❌ Error initializing: ${error instanceof Error ? 'An error occurred during initialization.' : 'An unknown error occurred.'}`);
            }
        };

        initDb();

        return () => {
            if (db) {
                db.close();
            }
            if (embeddings) {
                addLog('✅ Embeddings closed');
            }
        };
    }, []);

    const refreshDocuments = async () => {
        if (!db) return;
        const allDocs = await db.getAll();
        setDocuments(allDocs);
    };

    const handleStore = async () => {
        if (!db || !embeddings || !inputText || !documentId) return;
        try {
            const embedding = await embeddings.embed(inputText);
            console.log(embedding);
            await db.store({ 
                id: documentId, 
                text: inputText,
                embedding: embedding
            });
            
            addLog(`✅ Stored document with ID: ${documentId} and embedding`);
            await refreshDocuments();
            setInputText('');
            setDocumentId('');
        } catch (error) {
            addLog(`❌ Error storing document: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    const handleGet = async () => {
        if (!db || !documentId) return;
        try {
            const doc = await db.get(documentId);
            addLog(`📖 Retrieved document: ${JSON.stringify(doc)}`);
        } catch (error) {
            addLog(`❌ Error retrieving document: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    const handleGetAll = async () => {
        if (!db) return;
        try {
            const allDocs = await db.getAll();
            addLog(`📚 Retrieved all documents: ${JSON.stringify(allDocs)}`);
        } catch (error) {
            addLog(`❌ Error retrieving all documents: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    const handleUpdate = async () => {
        if (!db || !embeddings || !inputText || !documentId) return;
        try {
            const embedding = await embeddings.embed(inputText);
            
            await db.update({ 
                id: documentId, 
                text: inputText,
                embedding: embedding
            });
            
            addLog(`🔄 Updated document with ID: ${documentId} and new embedding`);
            await refreshDocuments();
            setInputText('');
            setDocumentId('');
        } catch (error) {
            addLog(`❌ Error updating document: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    const handleDelete = async () => {
        if (!db || !documentId) return;
        try {
            await db.delete(documentId);
            addLog(`🗑️ Deleted document with ID: ${documentId}`);
            await refreshDocuments();
            setDocumentId('');
        } catch (error) {
            addLog(`❌ Error deleting document: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    const handleClear = async () => {
        if (!db) return;
        try {
            await db.clear();
            addLog('🧹 Database cleared');
            await refreshDocuments();
        } catch (error) {
            addLog(`❌ Error clearing database: ${error instanceof Error ? error.message : String(error)}`);
        }
    };

    return (
        <div className="database-demo">
            <h1>IndexedDB Demo</h1>
            
            <div className="input-section">
                <input
                    type="text"
                    value={documentId}
                    onChange={(e) => setDocumentId(e.target.value)}
                    placeholder="Document ID"
                />
                <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Document Text"
                />
            </div>

            <div className="button-section">
                <button onClick={handleStore}>Store</button>
                <button onClick={handleGet}>Get</button>
                <button onClick={handleGetAll}>Get All</button>
                <button onClick={handleUpdate}>Update</button>
                <button onClick={handleDelete}>Delete</button>
                <button onClick={handleClear}>Clear All</button>
                <button onClick={refreshDocuments}>Refresh List</button>
            </div>

            <div className="documents-section">
                <h2>Stored Documents</h2>
                <div className="documents-list bg-gray-100 p-4 rounded-md">
                    {documents.map((doc) => (
                        <div key={doc.id} className="document-item">
                            <strong>ID: {doc.id}</strong>
                            <p>{doc.text}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="logs-section">
                <h2>Operation Logs</h2>
                <div className="logs bg-gray-100 p-4 rounded-md">
                    {logs.map((log, index) => (
                        <pre key={index} className="log-item text-black">{log}</pre>
                    ))}
                </div>
            </div>
        </div>
    );
}