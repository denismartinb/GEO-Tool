/* GenScore test extension: service worker.
   The only moment the page is read is a click on the toolbar icon (or its
   shortcut). That click grants activeTab for that tab until it navigates,
   which is also why the panel shows «Has cambiado de página» afterwards.
   Results live in chrome.storage.session, per tab, and are dropped when the
   tab navigates or closes. */
importScripts("collect.js");

const key = (tabId) => "r:" + tabId;

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
});

function reason(err, url) {
  const m = String((err && err.message) || err || "");
  if (/^(chrome|edge|about|devtools|chrome-extension|view-source):/i.test(url || "") || /chrome:\/\/|extensions gallery|webstore/i.test(m)) return "blocked";
  if (/Cannot access contents|permission|activeTab/i.test(m)) return "perm";
  if (/Frame with ID 0 was removed|No tab with id/i.test(m)) return "gone";
  return "other";
}

async function review(tab) {
  const tabId = tab.id;
  const prev = (await chrome.storage.session.get(key(tabId)))[key(tabId)];
  await chrome.storage.session.set({ [key(tabId)]: { state: "reading", at: Date.now(), prev: prev && prev.facts ? prev.facts : null } });
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: collectPageFacts });
    if (!res || !res.result) throw new Error("empty");
    let origin = null;
    try { origin = new URL(res.result.url).origin; } catch (e) {}
    /* o:<tabId> survives navigation: it is how the panel knows which site to
       ask a per-site permission for, since it cannot see the new URL */
    await chrome.storage.session.set({ [key(tabId)]: { state: "ok", at: Date.now(), facts: res.result }, ["o:" + tabId]: origin });
    return { ok: true };
  } catch (e) {
    const r = reason(e, tab.url);
    await chrome.storage.session.set({ [key(tabId)]: { state: "error", at: Date.now(), reason: r } });
    return { ok: false, reason: r };
  }
}

chrome.action.onClicked.addListener((tab) => {
  /* open() must run inside the click, before any await */
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  review(tab);
});

/* «Revisar otra vez» from the panel: works while the grant lasts (same tab,
   no navigation since the click). Otherwise the panel asks for the icon. */
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg && msg.type === "reread" && typeof msg.tabId === "number") {
    chrome.tabs.get(msg.tabId).then((tab) => review(tab)).then(reply, () => reply({ ok: false, reason: "gone" }));
    return true;
  }
  return false;
});

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading") chrome.storage.session.remove(key(tabId));
});
chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove([key(tabId), "o:" + tabId]));
