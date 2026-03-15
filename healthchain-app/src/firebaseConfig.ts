// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDKoD4GybBpM2nYts-y_tPupO924N25gVU",
  authDomain: "healthchain-a36b6.firebaseapp.com",
  databaseURL: "https://healthchain-a36b6-default-rtdb.firebaseio.com",
  projectId: "healthchain-a36b6",
  storageBucket: "healthchain-a36b6.firebasestorage.app",
  messagingSenderId: "98117718496",
  appId: "1:98117718496:web:5198b69f8e7c7bd1a2db85",
  measurementId: "G-EXG3DCMWM2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Initialize analytics only if supported
let analytics = null;
isSupported().then((supported) => {
  if (supported) {
    analytics = getAnalytics(app);
  }
});

export { db, app, analytics };