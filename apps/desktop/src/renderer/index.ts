console.log('Knowledge Desktop - Renderer Process Started');

// Check if electronAPI is available
if (window.electronAPI) {
  console.log('Electron API is available');
  
  // Test API
  window.electronAPI.auth.isLoggedIn().then((isLoggedIn) => {
    console.log('Is logged in:', isLoggedIn);
  });
  
  window.electronAPI.storage.getMode().then((mode) => {
    console.log('Storage mode:', mode);
  });
} else {
  console.error('Electron API is NOT available!');
}

// TODO: Load React app here
// For now, just show a simple UI
document.getElementById('root')!.innerHTML = `
  <div style="font-family: system-ui; padding: 20px;">
    <h1>Knowledge Desktop</h1>
    <p>Electron 桌面端正在运行...</p>
    <p>Storage Mode: <span id="storage-mode">Loading...</span></p>
    <p>Auth Status: <span id="auth-status">Loading...</span></p>
  </div>
`;

// Update UI
if (window.electronAPI) {
  window.electronAPI.storage.getMode().then((mode) => {
    document.getElementById('storage-mode')!.textContent = mode;
  });
  
  window.electronAPI.auth.isLoggedIn().then((isLoggedIn) => {
    document.getElementById('auth-status')!.textContent = isLoggedIn ? 'Logged In' : 'Anonymous';
  });
}
