// Relay fetches to avoid page-origin CORS; extension origin is privileged
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'OASA_FETCH') return;

  const { url, options } = message.payload || {};
  if (!url) {
    sendResponse({ ok: false, error: 'Missing URL' });
    return true;
  }

  fetch(url, options)
    .then(async (res) => {
      const status = res.status;
      const ok = res.ok;
      let data;
      try {
        data = await res.json();
      } catch (e) {
        data = null;
      }
      sendResponse({ ok, status, data });
    })
    .catch((err) => {
      sendResponse({ ok: false, status: 0, error: String(err) });
    });

  return true; // keep the message channel open for async sendResponse
});


