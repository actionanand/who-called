const KEYWORD_CODE =
  /\b(?:otp|code|pin|verification|delivery|reference|ref)\D{0,16}([A-Z0-9]{4,10})\b/i;
const STANDALONE_CODE = /\b(\d{4,8})\b/;

export function detectLikelyCode(message: string): string {
  return message.match(KEYWORD_CODE)?.[1] ?? message.match(STANDALONE_CODE)?.[1] ?? '';
}
