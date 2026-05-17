import Dexie, { type Table } from "dexie";
import { v7 as uuidv7 } from "uuid";

import type {
  ZerithDBConfig,
  Document,
  QueryFilter,
  InsertResult,
  UpdateSpec,
} from "zerithdb-core";

import { ZerithDBError, ErrorCode } from "zerithdb-core";
import { wrapIDBOperation } from "./internal/wrap-idb-operation.js";


export class CollectionClient<T extends Record<string, any> = Record<string, any>> {
  constructor(
    private readonly table: Table<Document<T>>,
    private readonly collectionName: string
  ) {}

  async insert(document: T): Promise<InsertResult> {
    const now = Date.now();
    const id = uuidv7();

    const doc: Document<T> = {
      ...document,
      _id: id,
      _createdAt: now,
      _updatedAt: now,
    };

    return wrapIDBOperation(
      ErrorCode.DB_WRITE_FAILED,
      `Failed to insert into "${this.collectionName}"`,
      async () => {
        await this.table.add(doc);
        return { id };
      }
    );
  }

  async insertMany(documents: T[]): Promise<InsertResult[]> {
    const now = Date.now();

    const docs = documents.map((doc) => ({
      ...doc,
      _id: uuidv7(),
      _createdAt: now,
      _updatedAt: now,
    })) as Document<T>[];

    return wrapIDBOperation(
      ErrorCode.DB_WRITE_FAILED,
      `Failed to bulk insert into "${this.collectionName}"`,
      async () => {
        await this.table.bulkAdd(docs);
        return docs.map((d) => ({ id: d._id }));
      }
    );
  }

  async find(filter: QueryFilter<T> = {}): Promise<Document<T>[]> {
    return wrapIDBOperation(
      ErrorCode.DB_READ_FAILED,
      `Failed to query "${this.collectionName}"`,
      async () => {
        const all = await this.table.toArray();
        return all.filter((doc) => this.matchesFilter(doc, filter));
      }
    );
  }

  async findById(id: string): Promise<Document<T> | undefined> {
    return wrapIDBOperation(
      ErrorCode.DB_READ_FAILED,
      `Failed to get "${id}"`,
      () => this.table.get(id)
    );
  }

  async update(filter: QueryFilter<T>, spec: UpdateSpec<T>): Promise<number> {
    return wrapIDBOperation(
      ErrorCode.DB_WRITE_FAILED,
      `Failed to update "${this.collectionName}"`,
      async () => {
        const matches = await this.find(filter);
        const now = Date.now();

        await this.table.bulkPut(
          matches.map((doc) => this.applyUpdateSpec(doc, spec, now))
        );

        return matches.length;
      }
    );
  }

  async delete(filter: QueryFilter<T>): Promise<number> {
    return wrapIDBOperation(
      ErrorCode.DB_DELETE_FAILED,
      `Failed to delete from "${this.collectionName}"`,
      async () => {
        const matches = await this.find(filter);
        await this.table.bulkDelete(matches.map((d) => d._id));
        return matches.length;
      }
    );
  }

  async clearAll(): Promise<void> {
    return wrapIDBOperation(
      ErrorCode.DB_DELETE_FAILED,
      `Failed to clear "${this.collectionName}"`,
      () => this.table.clear()
    );
  }

  async clear(): Promise<void> {
    return this.clearAll();
  }

  async count(filter: QueryFilter<T> = {}): Promise<number> {
    try {
      if (Object.keys(filter).length === 0) {
        return await this.table.count();
      }

      const all = await this.table.toArray();
      return all.filter((doc) => this.matchesFilter(doc, filter)).length;
    } catch (err) {
      throw new ZerithDBError(
        ErrorCode.DB_READ_FAILED,
        "Count failed",
        { cause: err }
      );
    }
  }

  // ✅ FIXED FILTER
  private matchesFilter(doc: Document<T>, filter: QueryFilter<T>): boolean {
    for (const [key, condition] of Object.entries(filter)) {
      const value = (doc as any)[key];

      if (condition === null || typeof condition !== "object") {
        if (value !== condition) return false;
        continue;
      }

      const cond = condition as any;

      if ("$eq" in cond && value !== cond.$eq) return false;
      if ("$ne" in cond && value === cond.$ne) return false;
      if ("$gt" in cond && !(value > cond.$gt)) return false;
      if ("$gte" in cond && !(value >= cond.$gte)) return false;
      if ("$lt" in cond && !(value < cond.$lt)) return false;
      if ("$lte" in cond && !(value <= cond.$lte)) return false;
      if ("$in" in cond && !cond.$in.includes(value)) return false;
      if ("$nin" in cond && cond.$nin.includes(value)) return false;
    }

    return true;
  }

  private applyUpdateSpec(
    doc: Document<T>,
    spec: UpdateSpec<T>,
    now: number
  ): Document<T> {
    return {
      ...doc,
      ...(spec.$set ?? {}),
      _updatedAt: now,
    };
  }
}

/* ================= DEXIE ================= */

class ZerithDBDexie extends Dexie {
  private readonly tableMap = new Map<string, Table>();
  private _schema: Record<string, string> = {};

  constructor(appId: string) {
    super(`zerithdb_${appId}`);
  }

  ensureCollection(name: string): Table {
    if (!this.tableMap.has(name)) {
      this._schema[name] = "_id, _createdAt, _updatedAt";

      const version = this.verno + 1;

      if (this.isOpen()) this.close();

      this.version(version).stores(this._schema);

      const table = this.table(name);
      this.tableMap.set(name, table);
    }

    return this.tableMap.get(name)!;
  }
}

/* ================= CLIENT ================= */

export class DbClient {
  private readonly dexie: ZerithDBDexie;
  private readonly collections = new Map<string, CollectionClient<any>>();

  constructor(config: ZerithDBConfig) {
    this.dexie = new ZerithDBDexie(config.appId);
  }

  collection<T extends Record<string, any>>(name: string): CollectionClient<T> {
    if (!this.collections.has(name)) {
      const table = this.dexie.ensureCollection(name);
      this.collections.set(
        name,
        new CollectionClient<T>(table as Table<Document<T>>, name)
      );
    }

    return this.collections.get(name)!;
  }

  async dispose(): Promise<void> {
    this.dexie.close();
  }
}