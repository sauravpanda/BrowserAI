import { VectorStore } from './types';

export interface VectorStoreFactory {
    createVectorStore(type: string): VectorStore;
}