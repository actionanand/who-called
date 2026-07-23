import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppStore } from '../../core/services/app-store.service';
import { AppIcon } from '../../shared/components/app-icon';
import { formatIndianPhone } from '../../core/utils/phone-number';

@Component({
  selector: 'app-home',
  imports: [AppIcon, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  protected readonly store = inject(AppStore);
  protected readonly formatPhone = formatIndianPhone;
}
