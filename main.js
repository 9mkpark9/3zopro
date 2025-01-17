const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // 보안 강화 설정
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js') 
    }
  });

  // index.html 로드
  mainWindow.loadFile(path.join(__dirname, 'src', 'login', 'index.html'));

  // 개발자도구(DevTools) 열기 (개발 중)
  // mainWindow.webContents.openDevTools();
}

// Electron 초기화 후 창 생성
app.whenReady().then(() => {
  createWindow();

  // macOS에서 모든 창이 닫혔을 때, 앱을 다시 활성화할 수 있도록 처리
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 모든 창이 닫혔을 때 앱 종료(Windows & Linux)
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
