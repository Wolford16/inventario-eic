/**
 * Script para subir el inventario inicial a Firebase Firestore.
 * 
 * USO:
 * 1. Ve a https://console.firebase.google.com
 * 2. Crea un proyecto nuevo (o usa uno existente)
 * 3. Activa Firestore Database (modo test)
 * 4. Ve a Configuración del proyecto > General > Agrega una app web
 * 5. Copia tu config de Firebase
 * 6. Pega la config en src/firebase.js
 * 7. Ejecuta: node scripts/upload-inventory.mjs
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, writeBatch, collection } from 'firebase/firestore';
import { readFileSync } from 'fs';

// ⚠️ PEGA TU CONFIG DE FIREBASE AQUÍ (la misma de src/firebase.js)
const firebaseConfig = {
  apiKey: "AIzaSyCGEF2skevbf4ad1-h0k3VMuX7GJVdw4IQ",
  authDomain: "inventario-2d1b4.firebaseapp.com",
  projectId: "inventario-2d1b4",
  storageBucket: "inventario-2d1b4.firebasestorage.app",
  messagingSenderId: "556306321473",
  appId: "1:556306321473:web:a062de37f910e573bfb6c0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function upload() {
  const jsonPath = join(__dirname, '../inventory_data.json');
  const data = JSON.parse(readFileSync(jsonPath, 'utf8'));
  console.log(`Subiendo ${data.length} bienes a Firestore...`);
  
  // Firestore batch write limit is 500 per batch
  const BATCH_SIZE = 400;
  
  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = data.slice(i, i + BATCH_SIZE);
    
    chunk.forEach((item, idx) => {
      const id = `item_${i + idx + 1}`;
      const ref = doc(db, 'bienes', id);
      batch.set(ref, {
        code: item.code,
        name: item.name,
        location: item.location,
        status: 'pending',
        foundLocation: null
      });
    });
    
    await batch.commit();
    console.log(`  ✓ Lote ${Math.floor(i / BATCH_SIZE) + 1}: items ${i + 1}-${Math.min(i + BATCH_SIZE, data.length)}`);
  }
  
  console.log('✅ ¡Inventario subido exitosamente!');
  process.exit(0);
}

upload().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

