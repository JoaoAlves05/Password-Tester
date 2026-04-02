function handleRuntimeError(reject, fallback) {
  const error = chrome.runtime.lastError;
  if (error) {
    reject(new Error(error.message));
    return true;
  }
  if (typeof fallback === 'function') {
    fallback();
  }
  return false;
}

export function getStorage(area = 'local', keys) {
  return new Promise((resolve, reject) => {
    chrome.storage[area].get(keys, items => {
      if (!handleRuntimeError(reject)) {
        resolve(items);
      }
    });
  });
}

export function setStorage(area = 'local', items) {
  return new Promise((resolve, reject) => {
    chrome.storage[area].set(items, () => {
      if (!handleRuntimeError(reject)) {
        resolve();
      }
    });
  });
}

export function removeStorage(area = 'local', keys) {
  return new Promise((resolve, reject) => {
    chrome.storage[area].remove(keys, () => {
      if (!handleRuntimeError(reject)) {
        resolve();
      }
    });
  });
}
