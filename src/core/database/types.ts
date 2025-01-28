export interface Storable {
    id: string;
  }
  
  export interface DatabaseConfig {
    databaseName: string;
    version?: number;
    storeName?: string;
  }
  
  export interface Database<T extends Storable> {
    store(data: T): Promise<void>;
    get(id: string): Promise<T | undefined>;
    getAll(): Promise<T[]>;
    update(data: T): Promise<void>;
    delete(id: string): Promise<void>;
    clear(): Promise<void>;
    close(): void;
  }
  
  export interface VectorStore {
      add(id: string, vector: number[]): Promise<void>;
      search(vector: number[], topK: number): Promise<string[]>;
  }
  
  
  export interface DatabaseFactory<T extends Storable>{
      create(config: DatabaseConfig): Database<T>;
  }
  
  export type DatabaseType = 'indexeddb' | 'sqlite';
  
  export interface DatabaseOptions {
      type: DatabaseType;
      config: DatabaseConfig;
  }