import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { FeedbackService } from './feedback.service';
import { NativeIntegrationService } from './native-integration.service';

@Injectable({ providedIn: 'root' })
export class CallService {
  private readonly document = inject(DOCUMENT);
  private readonly feedback = inject(FeedbackService);
  private readonly native = inject(NativeIntegrationService);

  async confirmAndCall(number = '', label = ''): Promise<boolean> {
    const target = label || number || 'the phone dialler';
    const confirmed = await this.feedback.confirm({
      title: number ? 'Start phone call?' : 'Open phone dialler?',
      message: number
        ? `Open the dialler for ${target}? You can review the number before placing the call.`
        : 'Open your phone dialler? No call will be placed automatically.',
      confirmLabel: 'Open dialler',
      destructive: false,
    });
    if (!confirmed) return false;
    if (this.native.openDialler(number)) return true;
    this.document.defaultView?.location.assign(`tel:${number}`);
    return true;
  }
}
