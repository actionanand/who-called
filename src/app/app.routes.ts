import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'home',
    loadComponent: () => import('./features/home/home').then((module) => module.Home),
    title: 'Home · Who Called?',
  },
  {
    path: 'contacts',
    loadComponent: () => import('./features/contacts/contacts').then((module) => module.Contacts),
    title: 'Private contacts · Who Called?',
  },
  {
    path: 'whatsapp',
    loadComponent: () => import('./features/whatsapp/whatsapp').then((module) => module.WhatsApp),
    title: 'WhatsApp chat · Who Called?',
  },
  {
    path: 'messages',
    loadComponent: () =>
      import('./features/saved-messages/saved-messages').then((module) => module.SavedMessages),
    title: 'Saved messages · Who Called?',
  },
  {
    path: 'tagged',
    loadComponent: () =>
      import('./features/tagged-numbers/tagged-numbers').then((module) => module.TaggedNumbers),
    title: 'Tagged numbers · Who Called?',
  },
  {
    path: 'keepsakes',
    loadComponent: () =>
      import('./features/keepsakes/keepsakes').then((module) => module.Keepsakes),
    title: 'Keepsakes · Who Called?',
  },
  {
    path: 'alerts',
    loadComponent: () =>
      import('./features/alert-directory/alert-directory').then((module) => module.AlertDirectory),
    title: 'Alert directory · Who Called?',
  },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/settings').then((module) => module.Settings),
    title: 'Settings · Who Called?',
  },
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  { path: '**', redirectTo: 'home' },
];
