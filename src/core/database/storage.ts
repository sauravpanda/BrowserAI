import { Storable, DatabaseConfig } from './types';

export interface Storage<T extends Storable> {
    store(data: T): Promise<void>;
    get(id: string): Promise<T | undefined>;
    getAll(): Promise<T[]>;
    update(data: T): Promise<void>;
    delete(id: string): Promise<void>;
    clear(): Promise<void>;
    close(): void;
}

export interface StorageFactory<T extends Storable> {
    createStorage(type: string, config: DatabaseConfig): Promise<Storage<T>>
}