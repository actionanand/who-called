import { NgOptimizedImage } from '@angular/common';
import { Component, inject } from '@angular/core';
import { AppStore } from '../../core/services/app-store.service';
import { ThemePreference } from '../../core/models/app.models';
import { AppIcon } from '../../shared/components/app-icon';

@Component({
  selector: 'app-settings',
  imports: [AppIcon, NgOptimizedImage],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  protected readonly store = inject(AppStore);

  protected selectTheme(theme: ThemePreference): void {
    void this.store.setTheme(theme);
  }
}
