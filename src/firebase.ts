import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyB3gBuhvTMaFAetFgbXQp46mT3be7H-Qwg",
  authDomain: "jt-golf-genius.firebaseapp.com",
  databaseURL: "https://jt-golf-genius-989ef-default-rtdb.firebaseio.com",
  projectId: "jt-golf-genius",
  storageBucket: "jt-golf-genius.firebasestorage.app",
  messagingSenderId: "559147014773",
  appId: "1:559147014773:web:2d39f1dd20b8bca2b1363c",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
