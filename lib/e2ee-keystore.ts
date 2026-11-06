// Keeps this browser's device keys in IndexedDB, and the signing key each device in a chat had when this browser first saw it. The
// private halves are non-extractable CryptoKey objects, so the browser stores them and they never leave it as raw bytes. Nothing in
// this file is sent to the server. Browser only.

import type { DeviceKeys } from "@/lib/e2ee"

const DATABASE = "rhenko-e2ee"
// Version 2 added the pins store. An upgrade creates whichever store is missing, so an older database keeps its device keys.
const VERSION = 2
const STORE = "devices"
const PINS = "pins"

type Stored = { agreementPrivate: CryptoKey; signingPrivate: CryptoKey; public: DeviceKeys["public"] }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION)
    request.onupgradeneeded = () => {
      for (const name of [STORE, PINS]) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// Runs one request in its own transaction and resolves with its result once the transaction has committed.
function run<T>(store: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode)
        const request = work(transaction.objectStore(store))
        transaction.oncomplete = () => {
          db.close()
          resolve(request.result)
        }
        transaction.onerror = () => {
          db.close()
          reject(transaction.error)
        }
        transaction.onabort = () => {
          db.close()
          reject(transaction.error)
        }
      })
  )
}

export async function saveDeviceKeys(deviceId: string, keys: DeviceKeys): Promise<void> {
  const stored: Stored = { agreementPrivate: keys.agreementPrivate, signingPrivate: keys.signingPrivate, public: keys.public }
  await run(STORE, "readwrite", (store) => store.put(stored, deviceId))
}

export async function loadDeviceKeys(deviceId: string): Promise<DeviceKeys | null> {
  const stored = await run<Stored | undefined>(STORE, "readonly", (store) => store.get(deviceId))
  if (!stored) return null
  return { agreementPrivate: stored.agreementPrivate, signingPrivate: stored.signingPrivate, public: stored.public }
}

export async function forgetDeviceKeys(deviceId: string): Promise<void> {
  await run(STORE, "readwrite", (store) => store.delete(deviceId))
}

// The signing key a device had when this browser first saw it, or null when it has not been seen before.
export async function pinnedSigningKey(deviceId: string): Promise<string | null> {
  const key = await run<string | undefined>(PINS, "readonly", (store) => store.get(deviceId))
  return key ?? null
}

// Remembers the signing key a device has, the first time this browser sees it. A key is not replaced once it is remembered.
export async function pinSigningKey(deviceId: string, signing: string): Promise<void> {
  await run(PINS, "readwrite", (store) => store.put(signing, deviceId))
}
