import { Component, computed, input } from '@angular/core';
import {
  LucideArchive,
  LucideBellRing,
  LucideBold,
  LucideBookmark,
  LucideBookmarkPlus,
  LucideCheck,
  LucideChevronLeft,
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
  LucideHighlighter,
  LucideCake,
  LucideCalendarDays,
  LucideGlobe,
  LucideGift,
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
  LucideUserRound,
  LucideUsersRound,
  LucideWifiOff,
  LucideX,
  type LucideIconInput,
} from '@lucide/angular';

const ICONS: Readonly<Record<string, LucideIconInput>> = {
  archive: LucideArchive,
  alert: LucideBellRing,
  bold: LucideBold,
  bookmark: LucideBookmark,
  'bookmark-plus': LucideBookmarkPlus,
  check: LucideCheck,
  'chevron-left': LucideChevronLeft,
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
  calendar: LucideCalendarDays,
  email: LucideMail,
  edit: LucidePencil,
  eye: LucideEye,
  'eye-off': LucideEyeOff,
  globe: LucideGlobe,
  keepsake: LucideGift,
  home: LucideHouse,
  highlight: LucideHighlighter,
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
  user: LucideUserRound,
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
