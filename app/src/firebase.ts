import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// 公開されても問題ない識別子。authDomain はサイト本体と同じドメインにする
// (iPhone の Safari などでログインの状態が消える問題の対策)。
const app = initializeApp({
  apiKey: 'AIzaSyCgbzBvtLN8Ckg0u1Ts0k5fDrrf4KvPTr4',
  authDomain: 'sotsuken-pj.web.app',
  projectId: 'sotsuken-pj',
  storageBucket: 'sotsuken-pj.firebasestorage.app',
  messagingSenderId: '348998571230',
  appId: '1:348998571230:web:736e9fbe81a33e0a4cde4f',
});

export const auth = getAuth(app);
export const db = getFirestore(app);
