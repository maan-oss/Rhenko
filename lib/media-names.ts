// Checks on uploaded file names that the browser can run too. The upload rules themselves live in lib/uploads.ts,
// which needs the server.

const VOICE_FILE = /\.(weba|m4a|oga)$/

// A voice message is an audio file. Chat shows it as a player rather than a photo.
export function isVoiceFile(name: string): boolean {
  return VOICE_FILE.test(name)
}
