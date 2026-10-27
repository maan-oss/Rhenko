// Checks on uploaded file names that the browser can run too. The upload rules themselves live in lib/uploads.ts,
// which needs the server.

const VOICE_FILE = /\.(weba|m4a|oga)$/
const AUDIO_FILE = /\.(weba|m4a|oga|mp3|wav)$/
const VIDEO_FILE = /\.(mp4|webm|mov)$/
const DOCUMENT_FILE = /\.(pdf|txt|csv|docx|xlsx|pptx|zip)$/

// A voice message is a recording made in the chat. Chat shows it as a player rather than a photo.
export function isVoiceFile(name: string): boolean {
  return VOICE_FILE.test(name)
}

// Any audio: a voice message or an audio file picked from the device.
export function isAudioFile(name: string): boolean {
  return AUDIO_FILE.test(name)
}

export function isVideoFile(name: string): boolean {
  return VIDEO_FILE.test(name)
}

// A file sent as it is: a PDF, a Word, Excel or PowerPoint file, text, CSV or a ZIP.
export function isDocumentFile(name: string): boolean {
  return DOCUMENT_FILE.test(name)
}
