import {
  get,
  off,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  runTransaction,
  set,
  update,
} from 'firebase/database';
import { db } from '@/lib/firebase/client';

/** Firebase Realtime Database 접근은 이 모듈을 통해서만 노출한다. */
export { db, get, off, onDisconnect, onValue, push, ref, remove, runTransaction, set, update };
