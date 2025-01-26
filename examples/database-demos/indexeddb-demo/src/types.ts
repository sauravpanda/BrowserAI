export interface Storable {
    id: string;
}

export interface Document extends Storable {
    text: string;
}

export interface DatabaseConfig {
    databaseName?: string;
}