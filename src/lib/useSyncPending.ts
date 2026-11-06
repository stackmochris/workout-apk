import { useEffect, useState } from 'react';
import { pendingFor, subscribeSync } from './cloudSync';

export function useSyncPending(uid: string | null | undefined) {
  const [pending, setPending] = useState(() => pendingFor(uid));
  useEffect(() => {
    const read = () => setPending(pendingFor(uid));
    read();
    return subscribeSync(read);
  }, [uid]);
  return pending;
}
