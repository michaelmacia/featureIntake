import { useEffect, useState } from 'react';
import { api } from './api.js';

let cached = null;

/** Server feature flags (assistant, mocks) from GET /api/meta, fetched once per page load. */
export function useFeatures() {
  const [features, setFeatures] = useState(cached);
  useEffect(() => {
    if (cached) return;
    api('/api/meta')
      .then((m) => { cached = m.features || {}; setFeatures(cached); })
      .catch(() => { cached = {}; setFeatures(cached); });
  }, []);
  return features; // null while loading
}
