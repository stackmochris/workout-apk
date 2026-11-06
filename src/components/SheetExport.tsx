import { useEffect, useState } from 'react';
import {
  isGoogleAccount,
  parseSpreadsheetId,
  sheetErrorMessage,
  spreadsheetUrl,
} from '../engine/sheetExport';
import { useAuth } from '../lib/auth';
import { exportWorkoutSheet, sheetExportBlocked } from '../lib/exportWorkoutSheet';
import { deleteExportSheetId, readExportSheetId, writeExportSheetId } from '../lib/sheetCloud';
import { forgetLocalSheetId, readLocalSheetId, resolveSheetId, writeLocalSheetId } from '../lib/sheetId';
import { AppData } from '../lib/store';

type Props = { data: AppData };

async function remember(uid: string, id: string) {
  writeLocalSheetId(uid, id);
  try {
    await writeExportSheetId(uid, id);
    return true;
  } catch {
    return false;
  }
}

export default function SheetExport({ data }: Props) {
  const { user, ready } = useAuth();
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const uid = user?.uid;

  useEffect(() => {
    if (!uid) {
      setSpreadsheetId(null);
      return;
    }
    let active = true;
    const local = readLocalSheetId(uid);
    setSpreadsheetId(local);
    void resolveSheetId(uid, { readRemote: () => readExportSheetId(uid) })
      .then((id) => { if (active) setSpreadsheetId(id); })
      .catch(() => {});
    return () => { active = false; };
  }, [uid]);

  const google = isGoogleAccount(user?.providerData.map((p) => p.providerId) ?? []);

  const savePasted = async () => {
    const id = parseSpreadsheetId(paste);
    if (!id) {
      setMsg('Paste a Google Sheet link or the spreadsheet id.');
      return;
    }
    if (!uid) {
      setMsg('Continue with Google first so this sheet is saved to your account.');
      return;
    }
    setSpreadsheetId(id);
    setPaste('');
    const synced = await remember(uid, id);
    setMsg(synced
      ? 'Next export will update this sheet.'
      : 'Saved on this device. It will be saved to your account when you are next online. Next export will update this sheet.');
  };

  const forget = async () => {
    if (!uid) return;
    if (!confirm('Forget the saved Google Sheet on this device? The file stays in Drive. The next export creates a new Workout Export.')) return;
    forgetLocalSheetId(uid);
    setSpreadsheetId(null);
    setMsg('Saved sheet forgotten. The next export creates a new Workout Export.');
    try { await deleteExportSheetId(uid); } catch { /* the device copy is already gone */ }
  };

  const exportSheet = async () => {
    setMsg('');
    const blocked = sheetExportBlocked(paste);
    if (blocked) {
      setMsg(blocked);
      return;
    }
    setBusy(true);
    try {
      const result = await exportWorkoutSheet({
        user,
        sessions: data.sessions,
        body: data.body,
        pasted: paste,
        onSpreadsheetId: setSpreadsheetId,
      });
      if (result.ok) {
        setPaste('');
        setSpreadsheetId(result.spreadsheetId);
      }
      setMsg(result.message);
    } catch (error) {
      setMsg(sheetErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="muted small">
        Writes Sessions and Body into a Google Sheet in your account. The first export creates Workout Export. Later exports update that same file.
        {!google && ' If this sign-in is not Google, export asks you to continue with Google so the file is created in your Drive. Logging workouts stays available either way.'}
      </p>
      {spreadsheetId && (
        <p><a className="sheet-link" href={spreadsheetUrl(spreadsheetId)} target="_blank" rel="noopener noreferrer">Open in Google Sheets</a></p>
      )}
      <button className="primary wide" type="button" disabled={busy || !ready} onClick={() => { void exportSheet(); }}>
        {busy ? 'Exporting…' : 'Export to Google Sheet'}
      </button>
      <label className="stack">Use an existing sheet (optional)
        <input
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="Paste a Google Sheet link or id"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <button className="ghost wide" type="button" disabled={busy || !paste.trim()} onClick={() => { void savePasted(); }}>Use this sheet</button>
      {spreadsheetId && <button className="ghost wide" type="button" disabled={busy} onClick={() => { void forget(); }}>Forget saved sheet</button>}
      {msg && <p className="muted small" role="status">{msg}</p>}
    </>
  );
}
