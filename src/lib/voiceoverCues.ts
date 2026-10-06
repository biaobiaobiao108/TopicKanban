export type VoiceoverCueTone = 'rhythm' | 'emphasis' | 'intent' | 'emotion';

export interface VoiceoverCuePreset {
  readonly label: string;
  readonly tone: VoiceoverCueTone;
}

export const VOICEOVER_CUES = [
  { label: '停顿', tone: 'rhythm' },
  { label: '重音', tone: 'emphasis' },
  { label: '反问', tone: 'intent' },
  { label: '反讽', tone: 'intent' },
  { label: '加快', tone: 'rhythm' },
  { label: '放慢', tone: 'rhythm' },
  { label: '克制', tone: 'emotion' },
  { label: '迟疑', tone: 'emotion' },
] as const satisfies readonly VoiceoverCuePreset[];

export function getVoiceoverCueTone(label: string): VoiceoverCueTone {
  return VOICEOVER_CUES.find((cue) => cue.label === label)?.tone ?? 'rhythm';
}
