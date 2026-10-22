import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

// E2E テスト (vite --mode e2e) のときだけ、本番ではなくエミュレータにつなぐ。
// 本番のビルドでは VITE_USE_EMULATOR は設定されない。
const useEmulator = import.meta.env.VITE_USE_EMULATOR === 'true';

// 公開されても問題ない識別子。authDomain はサイト本体と同じドメインにする
// (iPhone の Safari などでログインの状態が消える問題の対策)。
const app = initializeApp({
  apiKey: 'AIzaSyCgbzBvtLN8Ckg0u1Ts0k5fDrrf4KvPTr4',
  authDomain: 'sotsuken-pj.web.app',
  projectId: useEmulator ? 'demo-sotsuken' : 'sotsuken-pj',
  storageBucket: 'sotsuken-pj.firebasestorage.app',
  messagingSenderId: '348998571230',
  appId: '1:348998571230:web:736e9fbe81a33e0a4cde4f',
});

export const auth = getAuth(app);
export const db = getFirestore(app);

if (useEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
