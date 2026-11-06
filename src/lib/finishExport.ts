/**
 * Ask once after each completed workout. A skip is not a finished workout,
 * and declining does not ask again for that same session.
 */
export function offerSheetExport(seen: Set<string>, session: { id: string; status: string }): boolean {
  if (session.status !== 'completed') return false;
  if (seen.has(session.id)) return false;
  seen.add(session.id);
  return true;
}
