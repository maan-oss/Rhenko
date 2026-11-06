// Keeps this browser's device keys in IndexedDB. The private halves are non-extractable CryptoKey objects, so the browser stores
// them and they never leave it as raw bytes. Nothing in this file is sent to the server. Browser only.

import type { DeviceKeys } from "@/lib/e2ee"

const DATABASE = "rhenko-e2ee"
const STORE = "devices"

type Stored = { agreementPrivate: CryptoKey; signingPrivate: CryptoKey; public: DeviceKeys["public"] }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// Runs one request in its own transaction and resolves with its result once the transaction has committed.
function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode)
        const request = work(transaction.objectStore(STORE))
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
  await run("readwrite", (store) => store.put(stored, deviceId))
}

export async function loadDeviceKeys(deviceId: string): Promise<DeviceKeys | null> {
  const stored = await run<Stored | undefined>("readonly", (store) => store.get(deviceId))
  if (!stored) return null
  return { agreementPrivate: stored.agreementPrivate, signingPrivate: stored.signingPrivate, public: stored.public }
}

export async function forgetDeviceKeys(deviceId: string): Promise<void> {
  await run("readwrite", (store) => store.delete(deviceId))
}
