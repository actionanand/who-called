import { Component, computed, input } from '@angular/core';
import {
  LucideArchive,
  LucideBookmark,
  LucideBookmarkPlus,
  LucideCheck,
  LucideChevronRight,
  LucideChevronDown,
  LucideClipboard,
  LucideClock3,
  LucideCopy,
  LucideDynamicIcon,
  LucideEllipsisVertical,
  LucideEye,
  LucideEyeOff,
  LucideFileText,
  LucideFingerprint,
  LucideHeart,
  LucideCake,
  LucideGlobe,
  LucideMail,
  LucidePencil,
  LucideSave,
  LucideStar,
  LucideRotateCcw,
  LucideHouse,
  LucideLockKeyhole,
  LucideMessageCircle,
  LucideMoon,
  LucidePhone,
  LucidePhoneIncoming,
  LucidePhoneMissed,
  LucidePhoneOutgoing,
  LucidePlus,
  LucideSearch,
  LucideSettings,
  LucideShieldCheck,
  LucideSmartphone,
  LucideSun,
  LucideTag,
  LucideTrash2,
  LucideUserPlus,
  LucideUsersRound,
  LucideWifiOff,
  LucideX,
  type LucideIconInput,
} from '@lucide/angular';

const ICONS: Readonly<Record<string, LucideIconInput>> = {
  archive: LucideArchive,
  bookmark: LucideBookmark,
  'bookmark-plus': LucideBookmarkPlus,
  check: LucideCheck,
  chevron: LucideChevronRight,
  'chevron-down': LucideChevronDown,
  clipboard: LucideClipboard,
  clock: LucideClock3,
  close: LucideX,
  contacts: LucideUsersRound,
  copy: LucideCopy,
  document: LucideFileText,
  biometric: LucideFingerprint,
  favorite: LucideHeart,
  birthday: LucideCake,
  email: LucideMail,
  edit: LucidePencil,
  eye: LucideEye,
  'eye-off': LucideEyeOff,
  globe: LucideGlobe,
  home: LucideHouse,
  lock: LucideLockKeyhole,
  message: LucideMessageCircle,
  moon: LucideMoon,
  more: LucideEllipsisVertical,
  offline: LucideWifiOff,
  phone: LucidePhone,
  'phone-incoming': LucidePhoneIncoming,
  'phone-missed': LucidePhoneMissed,
  'phone-outgoing': LucidePhoneOutgoing,
  plus: LucidePlus,
  search: LucideSearch,
  settings: LucideSettings,
  save: LucideSave,
  star: LucideStar,
  restore: LucideRotateCcw,
  shield: LucideShieldCheck,
  smartphone: LucideSmartphone,
  sun: LucideSun,
  tag: LucideTag,
  trash: LucideTrash2,
  'user-plus': LucideUserPlus,
};

@Component({
  selector: 'app-icon',
  imports: [LucideDynamicIcon],
  template: `<svg [lucideIcon]="icon()" aria-hidden="true" focusable="false"></svg>`,
  styles: `
    :host {
      display: inline-grid;
      width: 1.25rem;
      height: 1.25rem;
      flex: 0 0 auto;
      place-items: center;
    }
    svg {
      width: 100%;
      height: 100%;
      stroke-width: 1.9;
    }
  `,
})
export class AppIcon {
  readonly name = input('shield');
  readonly icon = computed(() => ICONS[this.name()] ?? LucideShieldCheck);
}
