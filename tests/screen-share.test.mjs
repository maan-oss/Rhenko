// Unit checks for the screen sharing rules in lib/screen-share.ts. Run with: npm run test:unit

import { test } from "node:test"
import assert from "node:assert/strict"
import {
  pictureFit,
  pictureLead,
  SCREEN_SHARE_PEOPLE,
  screenShareAllowed,
  screenShareSupported,
  shareRoute,
  showsShareButton,
} from "../lib/screen-share.ts"

test("a screen can be shared in a one-to-one call, never in a group call of any size", () => {
  assert.equal(SCREEN_SHARE_PEOPLE, 2)
  assert.equal(screenShareAllowed({ kind: "dm", people: 2 }), true)
  for (let people = 1; people <= 6; people++) assert.equal(screenShareAllowed({ kind: "group", people }), false, `group of ${people}`)
  assert.equal(screenShareAllowed({ kind: "dm", people: 3 }), false)
})

test("only a browser with getDisplayMedia can share, so most iPhones get no button", () => {
  assert.equal(screenShareSupported({ getDisplayMedia() {} }), true)
  assert.equal(screenShareSupported({ getDisplayMedia: async () => ({}) }), true)
  assert.equal(screenShareSupported({}), false)
  assert.equal(screenShareSupported({ getDisplayMedia: true }), false)
  assert.equal(screenShareSupported(undefined), false)
  assert.equal(screenShareSupported(null), false)
})

test("the button shows once a one-to-one call is connected, and stays while a share is on", () => {
  const base = { kind: "dm", people: 2, sharing: false, supported: true }
  assert.equal(showsShareButton({ ...base, status: "active" }), true)
  assert.equal(showsShareButton({ ...base, status: "reconnecting" }), true)
  for (const status of ["idle", "outgoing", "incoming", "connecting", "ended"]) {
    assert.equal(showsShareButton({ ...base, status }), false, status)
  }
  // A share started while connected can always be stopped, but never on a call that has ended.
  assert.equal(showsShareButton({ ...base, status: "connecting", sharing: true }), true)
  assert.equal(showsShareButton({ ...base, status: "ended", sharing: true }), false)
})

test("the button is hidden where sharing is not possible or not allowed", () => {
  assert.equal(showsShareButton({ kind: "dm", people: 2, status: "active", sharing: false, supported: false }), false)
  assert.equal(showsShareButton({ kind: "group", people: 3, status: "active", sharing: false, supported: true }), false)
  assert.equal(showsShareButton({ kind: "group", people: 2, status: "active", sharing: true, supported: true }), false)
})

test("a camera that is sending is replaced; a voice call adds a picture, and reuses it next time", () => {
  assert.equal(shareRoute({ cameraSending: true, keptSender: false }), "replace-camera")
  assert.equal(shareRoute({ cameraSending: true, keptSender: true }), "replace-camera")
  assert.equal(shareRoute({ cameraSending: false, keptSender: false }), "add")
  assert.equal(shareRoute({ cameraSending: false, keptSender: true }), "reuse")
})

test("their screen leads the picture and is shown whole; a camera fills the frame", () => {
  assert.equal(pictureLead({ remoteScreen: true, video: true, sharing: true }), "their-screen")
  assert.equal(pictureLead({ remoteScreen: true, video: false, sharing: false }), "their-screen")
  assert.equal(pictureLead({ remoteScreen: false, video: true, sharing: true }), "their-camera")
  assert.equal(pictureLead({ remoteScreen: false, video: false, sharing: true }), "my-screen")
  assert.equal(pictureLead({ remoteScreen: false, video: false, sharing: false }), null)
  assert.equal(pictureFit("their-screen"), "contain")
  assert.equal(pictureFit("my-screen"), "contain")
  assert.equal(pictureFit("their-camera"), "cover")
})
