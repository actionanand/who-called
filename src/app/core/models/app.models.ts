export type ThemePreference = 'light' | 'dark' | 'automatic';

export interface PrivateContact {
  readonly id: string;
  readonly name: string;
  readonly company: string;
  readonly phone: string;
  readonly normalizedPhone: string;
  readonly whatsappEnabled: boolean;
  readonly favorite: boolean;
  readonly notes: string;
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

export interface AppSettings {
  readonly theme: ThemePreference;
  readonly defaultCountry: string;
  readonly defaultCallingCode: string;
  readonly recentActivityEnabled: boolean;
  readonly whatsappBusinessFallback: boolean;
}

export type RecordKind = 'contact' | 'message' | 'tagged-number' | 'settings';
