import { Component, computed, effect, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { DeviceCallHistoryEntry, PrivateContact, TaggedNumber } from '../../core/models/app.models';
import { CallService } from '../../core/services/call.service';
import { AppStore } from '../../core/services/app-store.service';
import {
  NativeIntegrationService,
  WhatsAppPackage,
} from '../../core/services/native-integration.service';
import { contactDisplayName } from '../../core/utils/contact-privacy';
import { digitsOnly } from '../../core/utils/phone-number';
import { environment } from '../../../environments/environment';
import { AppIcon } from '../../shared/components/app-icon';
import { WhatsAppAppChooser } from '../../shared/components/whatsapp-app-chooser';

interface HomeCallHistoryEntry extends DeviceCallHistoryEntry {
  readonly contact?: PrivateContact;
  readonly taggedNumber?: TaggedNumber;
  readonly displayName: string;
}

@Component({
  selector: 'app-home',
  imports: [AppIcon, RouterLink, WhatsAppAppChooser],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  protected readonly store = inject(AppStore);
  private readonly native = inject(NativeIntegrationService);
  private readonly router = inject(Router);
  private readonly calls = inject(CallService);
  private readonly document = inject(DOCUMENT);
  protected readonly callHistory = signal<readonly DeviceCallHistoryEntry[]>([]);
  protected readonly callHistoryLoading = signal(false);
  protected readonly callHistoryError = signal('');
  protected readonly callHistorySupported = this.native.deviceCallHistorySupported();
  protected readonly phoneAction = signal<{
    readonly display: string;
    readonly number: string;
  } | null>(null);
  protected readonly whatsappChoice = signal<{
    readonly number: string;
    readonly packages: readonly WhatsAppPackage[];
  } | null>(null);
  private callHistoryRequested = false;

  protected readonly enrichedCallHistory = computed<readonly HomeCallHistoryEntry[]>(() =>
    this.callHistory()
      .slice(0, environment.callHistoryLimit)
      .map((call) => {
        const key = this.phoneKey(call.number);
        const contact = this.store
          .activeContacts()
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

  protected callFromHistory(call: HomeCallHistoryEntry): void {
    if (!this.hasDialableNumber(call.number)) return;
    this.phoneAction.set({ display: call.displayName, number: call.number });
  }

  protected closePhoneAction(): void {
    this.phoneAction.set(null);
  }

  protected confirmPhoneCall(): void {
    const action = this.phoneAction();
    if (!action) return;
    this.phoneAction.set(null);
    this.calls.placeCall(action.number);
  }

  protected openPhoneWhatsApp(): void {
    const action = this.phoneAction();
    if (!action) return;
    const number = digitsOnly(action.number);
    if (!number) return;
    const packages = this.native.availableWhatsAppApps();
    this.phoneAction.set(null);
    if (packages.length > 1) {
      this.whatsappChoice.set({ number, packages });
      return;
    }
    if (packages.length === 1 && this.native.openWhatsAppIn(number, '', packages[0])) return;
    if (this.native.openWhatsApp(number, '', this.store.settings().whatsappBusinessFallback)) {
      return;
    }
    this.document.defaultView?.open(`https://wa.me/${number}`, '_blank', 'noopener,noreferrer');
  }

  protected openWhatsAppIn(packageName: WhatsAppPackage): void {
    const choice = this.whatsappChoice();
    if (!choice) return;
    this.whatsappChoice.set(null);
    this.native.openWhatsAppIn(choice.number, '', packageName);
  }

  protected callIcon(call: DeviceCallHistoryEntry): string {
    if (call.type === 'outgoing') return 'phone-outgoing';
    if (['missed', 'rejected', 'blocked'].includes(call.type)) return 'phone-missed';
    return 'phone-incoming';
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
