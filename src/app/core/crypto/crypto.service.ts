import { Injectable } from '@angular/core';

export interface EncryptedEnvelope {
  readonly version: 1;
  readonly iv: string;
  readonly ciphertext: string;
}

@Injectable({ providedIn: 'root' })
export class CryptoService {
  async createKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
  }

  async encrypt(value: unknown, key: CryptoKey): Promise<EncryptedEnvelope> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(value));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    return {
      version: 1,
      iv: this.toBase64(iv),
      ciphertext: this.toBase64(new Uint8Array(encrypted)),
    };
  }

  async decrypt<T>(envelope: EncryptedEnvelope, key: CryptoKey): Promise<T> {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: this.fromBase64(envelope.iv) },
      key,
      this.fromBase64(envelope.ciphertext),
    );
    return JSON.parse(new TextDecoder().decode(decrypted)) as T;
  }

  private toBase64(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  private fromBase64(value: string): ArrayBuffer {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
  }
}
