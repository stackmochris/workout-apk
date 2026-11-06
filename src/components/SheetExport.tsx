import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { googleSheetsAccessToken } from '../lib/googleAccess';
import { deleteExportSheetId, readExportSheetId, writeExportSheetId } from '../lib/sheetCloud';
import { forgetLocalSheetId, readLocalSheetId, resolveSheetId, writeLocalSheetId } from '../lib/sheetId';
import { AppData } from '../lib/store';
import {
  isGoogleAccount,
  parseSpreadsheetId,
  pushWorkoutSheet,
  sheetErrorMessage,
  spreadsheetUrl,
} from '../engine/sheetExport';

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
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setMsg('You are offline. The Google Sheet was not updated.');
      return;
    }
    const typed = paste.trim();
    const pastedId = typed ? parseSpreadsheetId(typed) : null;
    if (typed && !pastedId) {
      setMsg('That is not a Google Sheet link or id. The sheet was not updated.');
      return;
    }
    setBusy(true);
    try {
      const access = await googleSheetsAccessToken(user);
      let id = pastedId ?? readLocalSheetId(access.uid);
      if (!id) {
        try {
          id = await resolveSheetId(access.uid, { readRemote: () => readExportSheetId(access.uid) });
        } catch {
          setMsg('Could not check your saved sheet. The sheet was not updated.');
          return;
        }
      }
      if (pastedId) {
        writeLocalSheetId(access.uid, pastedId);
        setSpreadsheetId(pastedId);
      }
      const result = await pushWorkoutSheet({
        token: access.token,
        spreadsheetId: id,
        sessions: data.sessions,
        body: data.body,
        onId: async (createdId) => {
          writeLocalSheetId(access.uid, createdId);
          setSpreadsheetId(createdId);
          try { await writeExportSheetId(access.uid, createdId); } catch { /* device copy still blocks a second spreadsheet */ }
        },
      });
      setSpreadsheetId(result.spreadsheetId);
      setPaste('');
      const synced = await remember(access.uid, result.spreadsheetId);
      const lead = result.created
        ? 'Created Workout Export in your Google Drive and wrote your sessions and body stats.'
        : 'Updated Workout Export. The same sheet was used.';
      setMsg(synced ? lead : `${lead} The link is saved on this device and will sync to your account when you are online.`);
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
