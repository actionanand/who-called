import { inject, Injectable } from '@angular/core';
import { CryptoService, EncryptedEnvelope } from '../crypto/crypto.service';
import { RecordKind } from '../models/app.models';
import type { LocalRecordRepository } from '../repositories/repository.contracts';

interface StoredRecord {
  readonly key: string;
  readonly kind: RecordKind;
  readonly id: string;
  readonly payload: EncryptedEnvelope;
}

const DATABASE_NAME = 'who-called-private-v1';
const RECORD_STORE = 'encrypted-records';
const META_STORE = 'secure-meta';
const KEY_ID = 'browser-encryption-key-v1';

@Injectable({ providedIn: 'root' })
export class IndexedDbService implements LocalRecordRepository {
  private readonly cryptoService = inject(CryptoService);
  private databasePromise: Promise<IDBDatabase> | undefined;
  private keyPromise: Promise<CryptoKey> | undefined;

  async list<T>(kind: RecordKind): Promise<readonly T[]> {
    const database = await this.database();
    const key = await this.encryptionKey();
    const records = await this.request<readonly StoredRecord[]>((resolve, reject) => {
      const transaction = database.transaction(RECORD_STORE, 'readonly');
      const index = transaction.objectStore(RECORD_STORE).index('kind');
      const request = index.getAll(kind);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return Promise.all(records.map((record) => this.cryptoService.decrypt<T>(record.payload, key)));
  }

  async put<T extends { readonly id: string }>(kind: RecordKind, value: T): Promise<void> {
    const database = await this.database();
    const key = await this.encryptionKey();
    const payload = await this.cryptoService.encrypt(value, key);
    await this.request<void>((resolve, reject) => {
      const transaction = database.transaction(RECORD_STORE, 'readwrite');
      transaction.objectStore(RECORD_STORE).put({
        key: `${kind}:${value.id}`,
        kind,
        id: value.id,
        payload,
      } satisfies StoredRecord);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async remove(kind: RecordKind, id: string): Promise<void> {
    const database = await this.database();
    await this.request<void>((resolve, reject) => {
      const transaction = database.transaction(RECORD_STORE, 'readwrite');
      transaction.objectStore(RECORD_STORE).delete(`${kind}:${id}`);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async clear(kind: RecordKind): Promise<void> {
    const database = await this.database();
    const keys = await this.request<readonly IDBValidKey[]>((resolve, reject) => {
      const request = database
        .transaction(RECORD_STORE, 'readonly')
        .objectStore(RECORD_STORE)
        .index('kind')
        .getAllKeys(kind);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await this.request<void>((resolve, reject) => {
      const transaction = database.transaction(RECORD_STORE, 'readwrite');
      const store = transaction.objectStore(RECORD_STORE);
      for (const key of keys) store.delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  private database(): Promise<IDBDatabase> {
    this.databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        const records = database.createObjectStore(RECORD_STORE, { keyPath: 'key' });
        records.createIndex('kind', 'kind', { unique: false });
        database.createObjectStore(META_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.databasePromise;
  }

  private encryptionKey(): Promise<CryptoKey> {
    this.keyPromise ??= this.loadOrCreateKey();
    return this.keyPromise;
  }

  private async loadOrCreateKey(): Promise<CryptoKey> {
    const database = await this.database();
    const existing = await this.request<CryptoKey | undefined>((resolve, reject) => {
      const request = database
        .transaction(META_STORE, 'readonly')
        .objectStore(META_STORE)
        .get(KEY_ID);
      request.onsuccess = () => resolve(request.result as CryptoKey | undefined);
      request.onerror = () => reject(request.error);
    });
    if (existing) return existing;

    const key = await this.cryptoService.createKey();
    await this.request<void>((resolve, reject) => {
      const transaction = database.transaction(META_STORE, 'readwrite');
      transaction.objectStore(META_STORE).put(key, KEY_ID);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    return key;
  }

  private request<T>(
    setup: (resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
  ): Promise<T> {
    return new Promise<T>(setup);
  }
}
