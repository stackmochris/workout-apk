import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { parseSpreadsheetId } from '../engine/sheetExport';
import { db } from './firebase';

function exportDoc(uid: string) {
  if (!db) return null;
  return doc(db, 'users', uid, 'meta', 'export');
}

export async function readExportSheetId(uid: string): Promise<string | null> {
  const ref = exportDoc(uid);
  if (!ref) return null;
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const id = snap.data().spreadsheetId;
  return typeof id === 'string' ? parseSpreadsheetId(id) : null;
}

export async function writeExportSheetId(uid: string, spreadsheetId: string): Promise<void> {
  const ref = exportDoc(uid);
  const id = parseSpreadsheetId(spreadsheetId);
  if (!ref || !id) throw new Error('Firestore is unavailable');
  await setDoc(ref, { spreadsheetId: id, updatedAt: new Date().toISOString() });
}

export async function deleteExportSheetId(uid: string): Promise<void> {
  const ref = exportDoc(uid);
  if (!ref) return;
  await deleteDoc(ref);
}
