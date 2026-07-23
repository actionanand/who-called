import { InjectionToken, inject } from '@angular/core';
import { RecordKind } from '../models/app.models';
import { IndexedDbService } from '../database/indexed-db.service';

export interface LocalRecordRepository {
  list<T>(kind: RecordKind): Promise<readonly T[]>;
  put<T extends { readonly id: string }>(kind: RecordKind, value: T): Promise<void>;
  remove(kind: RecordKind, id: string): Promise<void>;
}

export interface CallHistoryProvider {
  readonly supported: boolean;
  requestAccess(): Promise<'granted' | 'denied' | 'unavailable'>;
}

export interface ExternalCommunicationService {
  openWhatsApp(number: string, message: string): Promise<boolean>;
  openDialler(number: string): Promise<boolean>;
  openSmsComposer(number: string, message: string): Promise<boolean>;
}

export interface SecureBackupService {
  createBackup(password: string): Promise<Uint8Array>;
  restoreBackup(payload: Uint8Array, password: string): Promise<void>;
}

export interface BiometricService {
  readonly supported: boolean;
  authenticate(reason: string): Promise<boolean>;
}

export const LOCAL_RECORD_REPOSITORY = new InjectionToken<LocalRecordRepository>(
  'LOCAL_RECORD_REPOSITORY',
  {
    providedIn: 'root',
    factory: () => inject(IndexedDbService),
  },
);
