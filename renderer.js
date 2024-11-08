const { ipcRenderer } = require('electron');

document.getElementById('startBtn').addEventListener('click', () => {
  ipcRenderer.send('start-tracking');
});

document.getElementById('stopBtn').addEventListener('click', () => {
  ipcRenderer.send('stop-tracking');
});

// Update URL and time spent when a new URL is tracked or tracking stops
ipcRenderer.on('url-update', (event, { url, timeSpent }) => {
  if (url) {
    const urlList = document.getElementById('urlList');
    const listItem = document.createElement('li');
    listItem.textContent = `URL: ${url}, Time Spent: ${timeSpent}`;
    urlList.appendChild(listItem);
  }
});

// Update timer display continuously while tracking is active
ipcRenderer.on('timer-update', (event, formattedTime) => {
  document.getElementById('timerDisplay').textContent = `Time: ${formattedTime}`;
});