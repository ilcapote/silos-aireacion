import dotenv from 'dotenv';
import { initDatabase } from '../database/db';

dotenv.config();

console.log('Inicializando base de datos...');
initDatabase();
console.log('Base de datos inicializada correctamente');
process.exit(0);
