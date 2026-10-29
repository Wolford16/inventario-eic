import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// TODO: Replace with your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCGEF2skevbf4ad1-h0k3VMuX7GJVdw4IQ",
  authDomain: "inventario-2d1b4.firebaseapp.com",
  projectId: "inventario-2d1b4",
  storageBucket: "inventario-2d1b4.firebasestorage.app",
  messagingSenderId: "556306321473",
  appId: "1:556306321473:web:a062de37f910e573bfb6c0"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

