import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DeviceCallHistoryEntry, PrivateContact, TaggedNumber } from '../../core/models/app.models';
import { AppStore } from '../../core/services/app-store.service';
import { NativeIntegrationService } from '../../core/services/native-integration.service';
import { contactDisplayName } from '../../core/utils/contact-privacy';
import { digitsOnly, formatIndianPhone } from '../../core/utils/phone-number';
import { AppIcon } from '../../shared/components/app-icon';

interface HomeCallHistoryEntry extends DeviceCallHistoryEntry {
  readonly contact?: PrivateContact;
  readonly taggedNumber?: TaggedNumber;
  readonly displayName: string;
}

@Component({
  selector: 'app-home',
  imports: [AppIcon, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  protected readonly store = inject(AppStore);
  private readonly native = inject(NativeIntegrationService);
  private readonly router = inject(Router);
  protected readonly formatPhone = formatIndianPhone;
  protected readonly displayName = contactDisplayName;
  protected readonly callHistory = signal<readonly DeviceCallHistoryEntry[]>([]);
  protected readonly callHistoryLoading = signal(false);
  protected readonly callHistoryError = signal('');
  protected readonly callHistorySupported = this.native.deviceCallHistorySupported();
  private callHistoryRequested = false;

  protected readonly enrichedCallHistory = computed<readonly HomeCallHistoryEntry[]>(() =>
    this.callHistory()
      .slice(0, 30)
      .map((call) => {
        const key = this.phoneKey(call.number);
        const contact = this.store
          .contacts()
          .find((entry) =>
            this.contactNumbers(entry).some((number) => this.phoneKey(number) === key),
          );
        const taggedNumber = this.store
          .taggedNumbers()
          .find((entry) => this.phoneKey(entry.normalizedPhone || entry.phone) === key);
        return {
          ...call,
          contact,
          taggedNumber,
          displayName:
            (contact ? contactDisplayName(contact) : '') ||
            call.cachedName ||
            this.displayPhone(call.number),
        };
      }),
  );

  constructor() {
    effect(() => {
      if (
        this.store.loading() ||
        !this.store.settings().deviceCallHistoryEnabled ||
        !this.callHistorySupported ||
        this.callHistoryRequested
      ) {
        return;
      }
      this.callHistoryRequested = true;
      void this.loadCallHistory();
    });
  }

  protected async enableCallHistory(): Promise<void> {
    await this.store.updateSettings({ deviceCallHistoryEnabled: true });
    this.callHistoryRequested = true;
    await this.loadCallHistory();
  }

  protected async loadCallHistory(): Promise<void> {
    this.callHistoryLoading.set(true);
    this.callHistoryError.set('');
    try {
      this.callHistory.set(await this.native.requestDeviceCallHistory());
    } catch (error: unknown) {
      this.callHistoryError.set(
        error instanceof Error ? error.message : 'Phone call history could not be loaded.',
      );
    } finally {
      this.callHistoryLoading.set(false);
    }
  }

  protected saveAsContact(call: HomeCallHistoryEntry): void {
    this.store.pendingContactDraft.set({
      phone: call.number,
      note: call.taggedNumber?.note ?? '',
      tag: call.taggedNumber?.tag ?? '',
    });
    void this.router.navigate(['/contacts'], { queryParams: { add: 1 } });
  }

  protected tagCall(call: HomeCallHistoryEntry): void {
    this.store.pendingTaggedNumber.set(call.number);
    void this.router.navigate(['/tagged'], { queryParams: { add: 1 } });
  }

  protected callTypeLabel(call: DeviceCallHistoryEntry): string {
    const labels: Readonly<Record<DeviceCallHistoryEntry['type'], string>> = {
      incoming: 'Incoming',
      outgoing: 'Outgoing',
      missed: 'Missed',
      rejected: 'Rejected',
      blocked: 'Blocked',
      voicemail: 'Voicemail',
      unknown: 'Call',
    };
    return labels[call.type];
  }

  protected callTime(timestamp: number): string {
    if (!timestamp) return '';
    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(timestamp));
  }

  protected duration(seconds: number): string {
    if (seconds <= 0) return '';
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
  }

  protected displayPhone(number: string): string {
    const digits = digitsOnly(number);
    if (!digits) return 'Private number';
    return number.startsWith('+') ? `+${digits}` : digits;
  }

  protected hasDialableNumber(number: string): boolean {
    return digitsOnly(number).length >= 6;
  }

  private phoneKey(number: string): string {
    return digitsOnly(number).slice(-10);
  }

  private contactNumbers(contact: PrivateContact): readonly string[] {
    return contact.phones?.length
      ? contact.phones.map((phone) => phone.normalizedNumber || phone.number)
      : [contact.normalizedPhone || contact.phone];
  }
}
