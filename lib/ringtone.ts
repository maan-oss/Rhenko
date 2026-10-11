// Ringing with no audio files: an incoming call plays two short tones twice over and buzzes a phone that can vibrate.
// An outgoing call plays a single long tone, like a phone ringing on the other end. Browsers only let audio start
// after the person has used the page, so a ring that comes first stays quiet until they do.

type Kind = "incoming" | "outgoing"

let context: AudioContext | null = null
let timer: ReturnType<typeof setInterval> | null = null

function tone(audio: AudioContext, frequency: number, start: number, length: number): void {
  const oscillator = audio.createOscillator()
  const gain = audio.createGain()
  const at = audio.currentTime + start
  oscillator.type = "sine"
  oscillator.frequency.value = frequency
  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(0.14, at + 0.02)
  gain.gain.linearRampToValueAtTime(0, at + length)
  oscillator.connect(gain).connect(audio.destination)
  oscillator.start(at)
  oscillator.stop(at + length + 0.05)
}

export function startRingtone(kind: Kind): void {
  stopRingtone()
  try {
    context = new AudioContext()
  } catch {
    return
  }
  const audio = context
  void audio.resume().catch(() => {})
  const burst = () => {
    if (kind === "incoming") {
      tone(audio, 440, 0, 0.45)
      tone(audio, 554, 0, 0.45)
      tone(audio, 440, 0.6, 0.45)
      tone(audio, 554, 0.6, 0.45)
      // Browsers refuse to vibrate until the person has used the page, so the buzz waits for that.
      if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([350, 180, 350])
    } else {
      tone(audio, 440, 0, 1)
    }
  }
  burst()
  timer = setInterval(burst, kind === "incoming" ? 2600 : 4000)
}

export function stopRingtone(): void {
  if (timer !== null) clearInterval(timer)
  timer = null
  if (context) void context.close().catch(() => {})
  context = null
}
