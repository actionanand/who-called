import { inject, Injectable } from '@angular/core';
import {
  AppSettings,
  ContactEmail,
  ContactPhone,
  ContactSocial,
  PrivateContact,
  SavedMessage,
  TaggedNumber,
} from '../models/app.models';
import { digitsOnly, normalizePhone } from '../utils/phone-number';
import { AppStore } from './app-store.service';

interface BackupEnvelope {
  readonly format: 'who-called-backup';
  readonly version: 1;
  readonly createdAt: string;
  readonly iterations: number;
  readonly salt: string;
  readonly iv: string;
  readonly ciphertext: string;
}

interface BackupSnapshot {
  readonly contacts: readonly PrivateContact[];
  readonly messages: readonly SavedMessage[];
  readonly taggedNumbers: readonly TaggedNumber[];
  readonly settings: AppSettings;
}

const BACKUP_ITERATIONS = 240_000;

@Injectable({ providedIn: 'root' })
export class DataPortabilityService {
  private readonly store = inject(AppStore);

  async createEncryptedBackup(passphrase: string): Promise<void> {
    this.validatePassphrase(passphrase);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(passphrase, salt, BACKUP_ITERATIONS);
    const snapshot: BackupSnapshot = {
      contacts: this.store.contacts(),
      messages: this.store.messages(),
      taggedNumbers: this.store.taggedNumbers(),
      settings: this.store.settings(),
    };
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(JSON.stringify(snapshot)),
    );
    const envelope: BackupEnvelope = {
      format: 'who-called-backup',
      version: 1,
      createdAt: new Date().toISOString(),
      iterations: BACKUP_ITERATIONS,
      salt: this.toBase64(salt),
      iv: this.toBase64(iv),
      ciphertext: this.toBase64(new Uint8Array(encrypted)),
    };
    const date = new Date().toISOString().slice(0, 10);
    this.download(
      `contacts-backup-${date}.contactvault`,
      JSON.stringify(envelope),
      'application/octet-stream',
    );
  }

  async restoreEncryptedBackup(file: File, passphrase: string): Promise<void> {
    this.validatePassphrase(passphrase);
    const parsed = JSON.parse(await file.text()) as Partial<BackupEnvelope>;
    if (
      parsed.format !== 'who-called-backup' ||
      parsed.version !== 1 ||
      !parsed.salt ||
      !parsed.iv ||
      !parsed.ciphertext ||
      !parsed.iterations
    ) {
      throw new Error('This is not a supported Who Called? backup.');
    }
    const key = await this.deriveKey(passphrase, this.fromBase64(parsed.salt), parsed.iterations);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: this.fromBase64(parsed.iv) },
      key,
      this.fromBase64(parsed.ciphertext),
    );
    const snapshot = JSON.parse(new TextDecoder().decode(decrypted)) as BackupSnapshot;
    if (
      !Array.isArray(snapshot.contacts) ||
      !Array.isArray(snapshot.messages) ||
      !Array.isArray(snapshot.taggedNumbers)
    ) {
      throw new Error('The backup contents are invalid.');
    }
    await this.store.replaceData(snapshot);
  }

  exportCsv(): void {
    const rows = [
      [
        'Name',
        'Company',
        'Phone type',
        'Calling code',
        'Phone',
        'Email',
        'Social URL',
        'Birthday',
        'Notes',
      ],
    ];
    for (const contact of this.store.contacts()) {
      const phones = contact.phones?.length
        ? contact.phones
        : [
            {
              type: 'Mobile',
              callingCode: '+91',
              number: contact.phone,
            },
          ];
      rows.push([
        contact.name,
        contact.company,
        phones.map((phone) => phone.type).join(' | '),
        phones.map((phone) => phone.callingCode).join(' | '),
        phones.map((phone) => phone.number).join(' | '),
        (contact.emails ?? []).map((email) => email.value).join(' | '),
        (contact.socialLinks ?? []).map((link) => link.url).join(' | '),
        this.birthDate(contact),
        contact.notes,
      ]);
    }
    const csv = rows.map((row) => row.map((value) => this.csvCell(value)).join(',')).join('\n');
    this.download('who-called-contacts.csv', csv, 'text/csv;charset=utf-8');
  }

  exportVCard(): void {
    const cards = this.store.contacts().map((contact) => {
      const phones = contact.phones?.length
        ? contact.phones
        : [{ type: 'Mobile', normalizedNumber: contact.normalizedPhone }];
      const lines = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${this.vCardValue(contact.name)}`,
        contact.company ? `ORG:${this.vCardValue(contact.company)}` : '',
        ...phones.map(
          (phone) =>
            `TEL;TYPE=${phone.type.toUpperCase()}:${'normalizedNumber' in phone ? phone.normalizedNumber : contact.normalizedPhone}`,
        ),
        ...(contact.emails ?? []).map(
          (email) => `EMAIL;TYPE=${email.type.toUpperCase()}:${this.vCardValue(email.value)}`,
        ),
        ...(contact.socialLinks ?? []).map(
          (link) => `URL;TYPE=${link.platform.toUpperCase()}:${this.vCardValue(link.url)}`,
        ),
        contact.notes ? `NOTE:${this.vCardValue(contact.notes)}` : '',
        'END:VCARD',
      ];
      return lines.filter(Boolean).join('\r\n');
    });
    this.download('who-called-contacts.vcf', cards.join('\r\n'), 'text/vcard;charset=utf-8');
  }

  async importCsv(file: File): Promise<number> {
    const lines = (await file.text())
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter((line) => line.trim());
    if (lines.length < 2) throw new Error('The CSV file does not contain any contacts.');
    const headers = this.parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
    let imported = 0;
    for (const line of lines.slice(1)) {
      const values = this.parseCsvLine(line);
      const value = (name: string): string => values[headers.indexOf(name)]?.trim() ?? '';
      const name = value('name');
      const phoneValues = (value('phone') || value('mobile') || value('telephone'))
        .split('|')
        .map((phone) => phone.trim())
        .filter(Boolean);
      if (!name || !phoneValues.length) continue;
      const types = value('phone type')
        .split('|')
        .map((type) => type.trim());
      const codes = value('calling code')
        .split('|')
        .map((code) => code.trim());
      const phones: readonly ContactPhone[] = phoneValues.map((phone, index) => ({
        id: crypto.randomUUID(),
        type: types[index] || 'Mobile',
        callingCode: codes[index] || this.store.settings().defaultCallingCode,
        number: digitsOnly(phone),
        normalizedNumber: phone.trim().startsWith('+')
          ? `+${digitsOnly(phone)}`
          : normalizePhone(codes[index] || this.store.settings().defaultCallingCode, phone),
        whatsappEnabled: true,
      }));
      const emails: readonly ContactEmail[] = (value('email') || value('email address'))
        .split('|')
        .map((email) => email.trim())
        .filter(Boolean)
        .map((email) => ({ id: crypto.randomUUID(), type: 'Personal', value: email }));
      const socialLinks: readonly ContactSocial[] = value('social url')
        .split('|')
        .map((url) => url.trim())
        .filter(Boolean)
        .map((url) => ({ id: crypto.randomUUID(), platform: 'Other', url }));
      await this.addImportedContact({
        name,
        company: value('company'),
        notes: value('notes'),
        phones,
        emails,
        socialLinks,
      });
      imported += 1;
    }
    if (!imported) throw new Error('No contacts with both a name and phone number were found.');
    return imported;
  }

  async importVCard(file: File): Promise<number> {
    const contents = (await file.text()).replace(/\r?\n[ \t]/g, '');
    const cards = contents.match(/BEGIN:VCARD[\s\S]*?END:VCARD/gi) ?? [];
    let imported = 0;
    for (const card of cards) {
      const lines = card.split(/\r?\n/);
      const property = (name: string): string =>
        this.unescapeVCard(
          lines
            .find((line) => new RegExp(`^${name}(?:;[^:]*)?:`, 'i').test(line))
            ?.split(':')
            .slice(1)
            .join(':') ?? '',
        );
      const name = property('FN');
      const phoneLines = lines.filter((line) => /^TEL(?:;[^:]*)?:/i.test(line));
      if (!name || !phoneLines.length) continue;
      const phones: readonly ContactPhone[] = phoneLines.map((line) => {
        const phone = this.unescapeVCard(line.split(':').slice(1).join(':'));
        const type = line.match(/TYPE=([^;:]+)/i)?.[1]?.split(',')[0] ?? 'Mobile';
        return {
          id: crypto.randomUUID(),
          type,
          callingCode: this.store.settings().defaultCallingCode,
          number: digitsOnly(phone),
          normalizedNumber: phone.trim().startsWith('+')
            ? `+${digitsOnly(phone)}`
            : normalizePhone(this.store.settings().defaultCallingCode, phone),
          whatsappEnabled: true,
        };
      });
      const emails: readonly ContactEmail[] = lines
        .filter((line) => /^EMAIL(?:;[^:]*)?:/i.test(line))
        .map((line) => ({
          id: crypto.randomUUID(),
          type: line.match(/TYPE=([^;:]+)/i)?.[1]?.split(',')[0] ?? 'Personal',
          value: this.unescapeVCard(line.split(':').slice(1).join(':')),
        }));
      const socialLinks: readonly ContactSocial[] = lines
        .filter((line) => /^URL(?:;[^:]*)?:/i.test(line))
        .map((line) => ({
          id: crypto.randomUUID(),
          platform: line.match(/TYPE=([^;:]+)/i)?.[1]?.split(',')[0] ?? 'Website',
          url: this.unescapeVCard(line.split(':').slice(1).join(':')),
        }));
      await this.addImportedContact({
        name,
        company: property('ORG'),
        notes: property('NOTE'),
        phones,
        emails,
        socialLinks,
      });
      imported += 1;
    }
    if (!imported) throw new Error('No valid contacts were found in the vCard file.');
    return imported;
  }

  private async deriveKey(
    passphrase: string,
    salt: Uint8Array<ArrayBuffer>,
    iterations: number,
  ): Promise<CryptoKey> {
    const material = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey'],
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  }

  private validatePassphrase(passphrase: string): void {
    if (passphrase.length < 8) throw new Error('Use a backup passphrase of at least 8 characters.');
  }

  private birthDate(contact: PrivateContact): string {
    const value = contact.birthDate;
    if (!value) return '';
    return value.mode === 'full' && value.year
      ? `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`
      : `${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
  }

  private csvCell(value: string): string {
    return `"${value.replaceAll('"', '""')}"`;
  }

  private parseCsvLine(line: string): readonly string[] {
    const values: string[] = [];
    let value = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"') {
        if (quoted && line[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (character === ',' && !quoted) {
        values.push(value);
        value = '';
      } else {
        value += character;
      }
    }
    values.push(value);
    return values;
  }

  private async addImportedContact(value: {
    readonly name: string;
    readonly company: string;
    readonly notes: string;
    readonly phones: readonly ContactPhone[];
    readonly emails: readonly ContactEmail[];
    readonly socialLinks: readonly ContactSocial[];
  }): Promise<void> {
    const primary = value.phones[0];
    const now = new Date().toISOString();
    await this.store.addContact({
      id: crypto.randomUUID(),
      name: value.name,
      company: value.company,
      phone: primary.number,
      normalizedPhone: primary.normalizedNumber,
      whatsappEnabled: primary.whatsappEnabled,
      favorite: false,
      notes: value.notes,
      phones: value.phones,
      emails: value.emails,
      socialLinks: value.socialLinks,
      createdAt: now,
      updatedAt: now,
    });
  }

  private vCardValue(value: string): string {
    return value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll(',', '\\,');
  }

  private unescapeVCard(value: string): string {
    return value
      .replaceAll('\\n', '\n')
      .replaceAll('\\,', ',')
      .replaceAll('\\;', ';')
      .replaceAll('\\\\', '\\');
  }

  private download(fileName: string, contents: string, type: string): void {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private toBase64(value: Uint8Array): string {
    let binary = '';
    for (const byte of value) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  private fromBase64(value: string): Uint8Array<ArrayBuffer> {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  }
}
