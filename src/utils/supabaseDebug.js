const subscribers = new Set();
let last = null;

export function setSupabaseError(msg) {
  last = msg || null;
  subscribers.forEach((s) => {
    try {
      s(last);
    } catch (e) {
      // ignore
    }
  });
}

export function clearSupabaseError() {
  last = null;
  subscribers.forEach((s) => {
    try {
      s(null);
    } catch (e) {}
  });
}

export function subscribeSupabaseError(cb) {
  subscribers.add(cb);
  if (last) cb(last);
  return () => subscribers.delete(cb);
}

export function getSupabaseError() {
  return last;
}

export default {
  setSupabaseError,
  clearSupabaseError,
  subscribeSupabaseError,
  getSupabaseError,
};
