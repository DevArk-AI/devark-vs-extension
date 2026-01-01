declare module 'sql.js' {
  export interface Database {
    run(sql: string, params?: any[]): Database;
    exec(sql: string): QueryExecResult[];
    each(sql: string, params: any[], callback: (row: any) => void, done: () => void): void;
    prepare(sql: string): Statement;
    getRowsModified(): number;
    close(): void;
  }

  export interface Statement {
    bind(params?: any[]): boolean;
    step(): boolean;
    getAsObject(params?: any): any;
    get(params?: any[]): any[];
    run(params?: any[]): void;
    reset(): void;
    free(): void;
  }

  export interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database;
  }

  export interface InitSqlJsOptions {
    locateFile?: (file: string) => string;
    wasmBinary?: ArrayBuffer;
  }

  export default function initSqlJs(options?: InitSqlJsOptions): Promise<SqlJsStatic>;
}
