export type ThemePreference = 'light' | 'dark' | 'automatic';

export interface ContactPhone {
  readonly id: string;
  readonly type: string;
  readonly callingCode: string;
  readonly number: string;
  readonly normalizedNumber: string;
  readonly whatsappEnabled: boolean;
}

export interface ContactEmail {
  readonly id: string;
  readonly type: string;
  readonly value: string;
}

export interface ContactSocial {
  readonly id: string;
  readonly platform: string;
  readonly url: string;
}

export interface ContactBirthDate {
  readonly mode: 'month-day' | 'full';
  readonly month: number;
  readonly day: number;
  readonly year?: number;
}

export interface PrivateContact {
  readonly id: string;
  readonly name: string;
  readonly company: string;
  readonly phone: string;
  readonly normalizedPhone: string;
  readonly whatsappEnabled: boolean;
  readonly favorite: boolean;
  readonly hidden?: boolean;
  readonly notes: string;
  readonly phones?: readonly ContactPhone[];
  readonly emails?: readonly ContactEmail[];
  readonly socialLinks?: readonly ContactSocial[];
  readonly birthDate?: ContactBirthDate;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SavedMessage {
  readonly id: string;
  readonly title: string;
  readonly message: string;
  readonly category: string;
  readonly sender: string;
  readonly detectedCode: string;
  readonly favorite: boolean;
  readonly createdAt: string;
}

export interface TaggedNumber {
  readonly id: string;
  readonly phone: string;
  readonly normalizedPhone: string;
  readonly tag: string;
  readonly note: string;
  readonly important: boolean;
  readonly appearanceCount: number;
  readonly lastSeenAt: string;
  readonly createdAt: string;
}

export type DeviceCallType =
  'incoming' | 'outgoing' | 'missed' | 'rejected' | 'blocked' | 'voicemail' | 'unknown';

export interface DeviceCallHistoryEntry {
  readonly id: string;
  readonly number: string;
  readonly cachedName: string;
  readonly type: DeviceCallType;
  readonly timestamp: number;
  readonly durationSeconds: number;
}

export interface AppSettings {
  readonly theme: ThemePreference;
  readonly defaultCountry: string;
  readonly defaultCallingCode: string;
  readonly recentActivityEnabled: boolean;
  readonly whatsappBusinessFallback: boolean;
  readonly deviceCallHistoryEnabled: boolean;
  readonly screenshotProtection: boolean;
  readonly pinEnabled: boolean;
  readonly pinSalt?: string;
  readonly pinVerifier?: string;
  readonly pinIterations?: number;
  readonly biometricEnabled: boolean;
  readonly hideHiddenContacts: boolean;
}

export type RecordKind = 'contact' | 'message' | 'tagged-number' | 'settings';
