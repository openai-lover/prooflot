import { parentPort, workerData } from 'node:worker_threads';
import { Store } from '../src/store.mjs';
const db = new Store(workerData.path);
parentPort.postMessage({ ready: true });
Atomics.wait(new Int32Array(workerData.signal), 0, 0);
try { parentPort.postMessage(db.reserve(workerData.id, workerData.step, 60000, 'a'.repeat(64))); }
finally { db.close(); }
