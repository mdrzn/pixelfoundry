export type SpeakerWord = { text: string; start: number; end: number; speaker_id?: string };
export type SpeakerSegment = { speaker: string; startMs: number; endMs: number; text: string };

/**
 * Merge consecutive words sharing the same speaker_id (default "0" when absent)
 * into diarized segments. startMs = first word start * 1000, endMs = last word
 * end * 1000, text = words joined with a single space.
 */
export function groupSpeakerSegments(words: SpeakerWord[]): SpeakerSegment[] {
  const segments: SpeakerSegment[] = [];
  let cur: SpeakerSegment | null = null;
  let parts: string[] = [];

  for (const w of words) {
    const speaker = w.speaker_id ?? "0";
    if (cur && cur.speaker === speaker) {
      cur.endMs = w.end * 1000;
      parts.push(w.text);
    } else {
      if (cur) cur.text = parts.join(" ");
      cur = { speaker, startMs: w.start * 1000, endMs: w.end * 1000, text: "" };
      parts = [w.text];
      segments.push(cur);
    }
  }
  if (cur) cur.text = parts.join(" ");

  return segments;
}
