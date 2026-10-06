export type VoiceoverCueTone = 'rhythm' | 'emphasis' | 'intent' | 'emotion';

export interface VoiceoverCuePreset {
  readonly label: string;
  readonly tone: VoiceoverCueTone;
  readonly symbol: string;
}

export const VOICEOVER_CUES = [
  { label: '停顿', tone: 'rhythm', symbol: 'Ⅱ' },
  { label: '重音', tone: 'emphasis', symbol: '!' },
  { label: '反问', tone: 'intent', symbol: '?' },
  { label: '反讽', tone: 'intent', symbol: '↗' },
  { label: '加快', tone: 'rhythm', symbol: '»' },
  { label: '放慢', tone: 'rhythm', symbol: '◷' },
  { label: '克制', tone: 'emotion', symbol: '—' },
  { label: '迟疑', tone: 'emotion', symbol: '…' },
] as const satisfies readonly VoiceoverCuePreset[];

export function getVoiceoverCueTone(label: string): VoiceoverCueTone {
  return VOICEOVER_CUES.find((cue) => cue.label === label)?.tone ?? 'rhythm';
}

export function getVoiceoverCueSymbol(label: string): string {
  return VOICEOVER_CUES.find((cue) => cue.label === label)?.symbol ?? 'Ⅱ';
}
