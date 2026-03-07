import { Storable, Database, DatabaseOptions, VectorStore } from './types';
import { Storage, StorageFactory } from './storage';
import { VectorStoreFactory } from './vectorstore';
import { IndexedDBStorageFactory } from './implementation/indexeddb';

// placeholder for vectorstore factories
const vectorStoreFactories: Record<string, VectorStoreFactory> = {};

// register storage factories here
const storageFactories: Record<string, StorageFactory<any>> = {
  indexeddb: new IndexedDBStorageFactory(),
};

export class DatabaseImpl<T extends Storable> implements Database<T> {
  private storage!: Storage<T>;
  private vectorStore?: VectorStore;

  constructor() {}

  async initialize(options: DatabaseOptions) {
    if (!storageFactories[options.type]) {
      throw new Error(`storage type not supported ${options.type}`);
    }
    this.storage = await storageFactories[options.type].createStorage(options.type, options.config);
  }

  async store(data: T): Promise<void> {
    return this.storage.store(data);
  }

  async get(id: string): Promise<T | undefined> {
    return this.storage.get(id);
  }

  async getAll(): Promise<T[]> {
    return this.storage.getAll();
  }

  async update(data: T): Promise<void> {
    return this.storage.update(data);
  }

  async delete(id: string): Promise<void> {
    return this.storage.delete(id);
  }

  async clear(): Promise<void> {
    return this.storage.clear();
  }

  close(): void {
    if (this.storage) {
      this.storage.close();
    }
  }

  setVectorStore(type: string): void {
    if (!vectorStoreFactories[type]) {
      const available = Object.keys(vectorStoreFactories);
      throw new Error(
        available.length === 0
          ? `Vector store support is not yet implemented. No vector store backends are available.`
          : `Vector store type "${type}" not supported. Available types: ${available.join(', ')}`,
      );
    }

    this.vectorStore = vectorStoreFactories[type].createVectorStore(type);
  }

  async addVector(id: string, vector: number[]): Promise<void> {
    if (!this.vectorStore) {
      throw new Error('Vector store not initialized. Call setVectorStore() first.');
    }
    await this.vectorStore.add(id, vector);
  }

  async searchVector(vector: number[], topK: number): Promise<string[]> {
    if (!this.vectorStore) {
      throw new Error('Vector store not initialized. Call setVectorStore() first.');
    }
    return await this.vectorStore.search(vector, topK);
  }
}
