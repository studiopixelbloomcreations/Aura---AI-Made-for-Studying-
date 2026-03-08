const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("DesktopAssistant", {
  getCapabilities: () => ipcRenderer.invoke("assistant:get_capabilities"),
  executeAction: (action) => ipcRenderer.invoke("assistant:execute_action", action),
  getEvolutionCapabilities: () => ipcRenderer.invoke("assistant:evolution_capabilities"),
  startEvolution: (payload) => ipcRenderer.invoke("assistant:evolution_start", payload),
  listEvolution: () => ipcRenderer.invoke("assistant:evolution_list"),
  getEvolution: (proposalId) => ipcRenderer.invoke("assistant:evolution_get", proposalId),
  deployEvolution: (payload) => ipcRenderer.invoke("assistant:evolution_deploy", payload),
  syncCloudRepoNow: () => ipcRenderer.invoke("assistant:cloud_sync_now"),
  startCloudRepoSync: (intervalMs) => ipcRenderer.invoke("assistant:cloud_sync_start", intervalMs),
  stopCloudRepoSync: () => ipcRenderer.invoke("assistant:cloud_sync_stop"),
  onEvolutionEvent: (handler) => {
    if (typeof handler !== "function") return () => {};
    const listener = (_event, data) => handler(data);
    ipcRenderer.on("desktop:evolution-event", listener);
    return () => ipcRenderer.removeListener("desktop:evolution-event", listener);
  },
});
