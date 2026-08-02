import { webcrypto } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const password = '12345678';
const createdAt = '2026-08-03T06:00:00.000Z';

const contacts = [
  {
    id: 'sample-anand',
    name: 'Anand Kumar',
    company: 'Acme Technologies',
    phone: '9876543210',
    normalizedPhone: '+919876543210',
    whatsappEnabled: true,
    favorite: true,
    hidden: false,
    notes: 'Favourite sample with multiple numbers, a birthday and three anniversaries.',
    phones: [
      {
        id: 'anand-mobile',
        type: 'Mobile',
        callingCode: '+91',
        number: '9876543210',
        normalizedNumber: '+919876543210',
        whatsappEnabled: true,
      },
      {
        id: 'anand-work',
        type: 'Work',
        callingCode: '+91',
        number: '8040012345',
        normalizedNumber: '+918040012345',
        whatsappEnabled: false,
      },
    ],
    emails: [
      { id: 'anand-personal-email', type: 'Personal', value: 'anand@example.com' },
      { id: 'anand-work-email', type: 'Work', value: 'anand@acme.example' },
    ],
    socialLinks: [
      {
        id: 'anand-linkedin',
        platform: 'LinkedIn',
        url: 'https://www.linkedin.com/in/anand-example',
      },
      { id: 'anand-website', platform: 'Website', url: 'https://example.com/anand' },
    ],
    birthDate: { mode: 'full', year: 1990, month: 8, day: 3, reminderEnabled: true },
    anniversaries: [
      {
        id: 'anand-wedding',
        name: 'Wedding anniversary',
        year: 2018,
        month: 8,
        day: 15,
        reminderEnabled: true,
      },
      {
        id: 'anand-work-anniversary',
        name: 'Work anniversary',
        year: 2020,
        month: 9,
        day: 1,
        reminderEnabled: true,
      },
      {
        id: 'anand-friendship',
        name: 'Friendship day',
        year: 2012,
        month: 12,
        day: 10,
        reminderEnabled: false,
      },
    ],
    createdAt,
    updatedAt: createdAt,
  },
  {
    id: 'sample-meera',
    name: 'Meera Nair',
    company: 'Green Leaf Studio',
    phone: '9123456780',
    normalizedPhone: '+919123456780',
    whatsappEnabled: true,
    favorite: false,
    hidden: false,
    notes: 'Month-and-day birthday sample. Age should not be displayed.',
    phones: [
      {
        id: 'meera-mobile',
        type: 'Mobile',
        callingCode: '+91',
        number: '9123456780',
        normalizedNumber: '+919123456780',
        whatsappEnabled: true,
      },
    ],
    emails: [{ id: 'meera-email', type: 'Personal', value: 'meera@example.com' }],
    socialLinks: [
      {
        id: 'meera-instagram',
        platform: 'Instagram',
        url: 'https://www.instagram.com/example',
      },
    ],
    birthDate: { mode: 'month-day', month: 8, day: 7, reminderEnabled: true },
    anniversaries: [
      {
        id: 'meera-studio',
        name: 'Studio opening',
        year: 2023,
        month: 8,
        day: 20,
        reminderEnabled: false,
      },
    ],
    createdAt,
    updatedAt: createdAt,
  },
  {
    id: 'sample-rahul',
    name: 'Rahul Menon',
    company: '',
    phone: '9988776655',
    normalizedPhone: '+919988776655',
    whatsappEnabled: false,
    favorite: false,
    hidden: true,
    notes: 'Hidden contact sample for testing masked names in alerts and notifications.',
    phones: [
      {
        id: 'rahul-home',
        type: 'Home',
        callingCode: '+91',
        number: '9988776655',
        normalizedNumber: '+919988776655',
        whatsappEnabled: false,
      },
    ],
    emails: [],
    socialLinks: [],
    birthDate: { mode: 'full', year: 1988, month: 9, day: 12, reminderEnabled: false },
    anniversaries: [
      {
        id: 'rahul-special',
        name: 'Special day',
        year: 2015,
        month: 10,
        day: 5,
        reminderEnabled: true,
      },
    ],
    createdAt,
    updatedAt: createdAt,
  },
  {
    id: 'sample-sarah',
    name: 'Sarah Williams',
    company: 'Northwind Services',
    phone: '2025550148',
    normalizedPhone: '+12025550148',
    whatsappEnabled: true,
    favorite: true,
    hidden: false,
    notes: 'International contact without active reminders.',
    phones: [
      {
        id: 'sarah-mobile',
        type: 'Mobile',
        callingCode: '+1',
        number: '2025550148',
        normalizedNumber: '+12025550148',
        whatsappEnabled: true,
      },
    ],
    emails: [{ id: 'sarah-email', type: 'Work', value: 'sarah@example.com' }],
    socialLinks: [{ id: 'sarah-website', platform: 'Website', url: 'https://example.com/sarah' }],
    birthDate: { mode: 'full', year: 1995, month: 11, day: 24, reminderEnabled: false },
    anniversaries: [],
    createdAt,
    updatedAt: createdAt,
  },
];

const snapshot = {
  contacts,
  messages: [
    {
      id: 'sample-message',
      title: 'Sample booking',
      message: 'Booking reference WC-2026-4821',
      category: 'Booking',
      sender: 'Who Called sample',
      detectedCode: '4821',
      favorite: true,
      createdAt,
    },
  ],
  taggedNumbers: [
    {
      id: 'sample-tag',
      phone: '9000012345',
      normalizedPhone: '+919000012345',
      tag: 'Delivery',
      note: 'Sample tagged number for testing call-history matching.',
      important: true,
      appearanceCount: 2,
      lastSeenAt: createdAt,
      createdAt,
    },
  ],
  settings: {
    theme: 'automatic',
    defaultCountry: 'India',
    defaultCallingCode: '+91',
    recentActivityEnabled: true,
    whatsappBusinessFallback: true,
    deviceCallHistoryEnabled: true,
    screenshotProtection: true,
    pinEnabled: false,
    biometricEnabled: false,
    hideHiddenContacts: false,
  },
};

const encoder = new TextEncoder();
const salt = webcrypto.getRandomValues(new Uint8Array(16));
const iv = webcrypto.getRandomValues(new Uint8Array(12));
const material = await webcrypto.subtle.importKey(
  'raw',
  encoder.encode(password),
  'PBKDF2',
  false,
  ['deriveKey'],
);
const key = await webcrypto.subtle.deriveKey(
  { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 240_000 },
  material,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt'],
);
const ciphertext = await webcrypto.subtle.encrypt(
  { name: 'AES-GCM', iv },
  key,
  encoder.encode(JSON.stringify(snapshot)),
);
const base64 = (value) => Buffer.from(value).toString('base64');
const envelope = {
  format: 'who-called-backup',
  version: 1,
  createdAt: new Date().toISOString(),
  iterations: 240_000,
  salt: base64(salt),
  iv: base64(iv),
  ciphertext: base64(new Uint8Array(ciphertext)),
};

const outputDirectory = resolve('sample-data');
const outputPath = resolve(outputDirectory, 'who-called-sample.contactvault');
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, JSON.stringify(envelope, null, 2) + '\n', 'utf8');
console.log(`Created ${outputPath}`);
