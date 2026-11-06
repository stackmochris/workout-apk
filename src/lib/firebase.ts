import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from 'firebase/firestore';

/** Public web config for the existing stackmochris-workout project. */
export const firebaseConfig = {
  apiKey: 'AIzaSyCBljROeqqsGI3Jx_1eCYmiXfK80U7VM0k',
  authDomain: 'stackmochris-workout.firebaseapp.com',
  projectId: 'stackmochris-workout',
  storageBucket: 'stackmochris-workout.firebasestorage.app',
  messagingSenderId: '1051879634154',
  appId: '1:1051879634154:web:cc11cea51ba042921f5393',
};

function init(): { app: FirebaseApp; auth: Auth; db: Firestore } | null {
  try {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const auth = getAuth(app);
    let db: Firestore;
    try {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      });
    } catch {
      db = getFirestore(app);
    }
    return { app, auth, db };
  } catch {
    return null;
  }
}

const services = init();

export const firebaseApp = services?.app ?? null;
export const auth = services?.auth ?? null;
export const db = services?.db ?? null;
