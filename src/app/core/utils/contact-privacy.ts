import { PrivateContact } from '../models/app.models';

export function contactDisplayName(contact: PrivateContact): string {
  if (!contact.hidden) return contact.name;
  const name = contact.name.trim();
  const characters = Array.from(name);
  if (characters.length <= 1) return `${name}•••`;
  if (characters.length === 2) return `${characters[0]}•••${characters[1]}`;
  const center = Math.floor((characters.length - 1) / 2);
  const middleIndex =
    characters
      .map((character, index) => ({ character, index }))
      .filter(
        ({ character, index }) =>
          index > 0 && index < characters.length - 1 && /[\p{L}\p{N}]/u.test(character),
      )
      .sort((left, right) => Math.abs(left.index - center) - Math.abs(right.index - center))[0]
      ?.index ?? center;
  const leftMask = '•'.repeat(Math.max(1, middleIndex - 1));
  const rightMask = '•'.repeat(Math.max(1, characters.length - middleIndex - 2));
  return `${characters[0]}${leftMask}${characters[middleIndex]}${rightMask}${characters.at(-1)}`;
}
