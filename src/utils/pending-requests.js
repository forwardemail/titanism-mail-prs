export const createPendingRequests = () => {
  const pending = new Map();

  const add = (id) =>
    new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });

  const resolve = (id, result) => {
    const entry = pending.get(id);
    if (!entry) return false;
    pending.delete(id);
    entry.resolve(result);
    return true;
  };

  const reject = (id, error) => {
    const entry = pending.get(id);
    if (!entry) return false;
    pending.delete(id);
    entry.reject(error);
    return true;
  };

  const clear = (error) => {
    if (error) {
      for (const [, entry] of pending) {
        entry.reject(error);
      }
    }
    pending.clear();
  };

  return {
    add,
    resolve,
    reject,
    clear,
  };
};
