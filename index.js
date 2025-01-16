const { app, BrowserWindow, ipcMain } = require('electron');

let mainWindow;
let registerWindow;
let managerWindow;
let studentWindow;
let makeclasswindow;
let courseviewwindow;
let selectclasswindow;

function create_main()
{
  mainWindow = new BrowserWindow({
    width: 600,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  })
}

app.on('ready', () => {
  // 메인 윈도우 생성
  
  create_main();
  mainWindow.loadFile('HTML/login.html');

  // 회원가입 창 열기 이벤트
  ipcMain.on('open-register-window', () => {
    if (!registerWindow) {
      registerWindow = new BrowserWindow({
        width: 400,
        height: 600,
        parent: mainWindow, // 부모 창 설정
        modal: true,       // 부모 창 위에 표시
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
        },
      });

      registerWindow.loadFile('HTML/register.html');

      // 회원가입 창이 닫힐 때 처리
      registerWindow.on('closed', () => {
        registerWindow = null; // 참조 제거
        if (mainWindow) mainWindow.focus(); // 메인 창 활성화
      });
    }
  });

    // 관리자UI 창 열기 이벤트
  ipcMain.on('open-managerUI-window', () => {
    if (!managerWindow) {
      managerWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
        },
      });
  
      managerWindow.loadFile('HTML/managerUI.html');
  
        // 창이 닫힐 때 처리
        managerWindow.on('closed', () => {
          managerWindow = null; // 참조 제거
          create_main();
          mainWindow.loadFile('HTML/login.html');
      });
    }
  });
   //  학생UI 창 열기
  ipcMain.on('open-studentUI-window', () => {
    if (!studentWindow) {
      studentWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
        },
      });
  
      studentWindow.loadFile('HTML/studentUI.html');
  
        // 창이 닫힐 때 처리
        studentWindow.on('closed', () => {
          studentWindow = null; // 참조 제거
          create_main();
          mainWindow.loadFile('HTML/login.html');
      });
    }
  });

   // 강의 생성 창 열기
  ipcMain.on('open-makeclass-window', () => {
    if (!makeclasswindow) {
      makeclasswindow = new BrowserWindow({
        width: 1000,
        height: 1000,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
        },
      });
  
      makeclasswindow.loadFile('HTML/makeclass.html');
  
        // 창이 닫힐 때 처리
        makeclasswindow.on('closed', () => {
          makeclasswindow = null; // 참조 제거
      });
    }
  });

      // 관리자UI 창 열기 이벤트
  ipcMain.on('open-courseview-window', () => {
    if (!courseviewwindow) {
      courseviewwindow = new BrowserWindow({
        width: 800,
        height: 800,
        webPreferences: {
          nodeIntegration: true,
           contextIsolation: false,
        },
       });
      
       courseviewwindow.loadFile('HTML/course_view.html');
      
        // 창이 닫힐 때 처리
        courseviewwindow.on('closed', () => {
          courseviewwindow = null; // 참조 제거
      });
     }
   });

  ipcMain.on('open-selectclass-window', () => {
    if (!selectclasswindow) {
      selectclasswindow = new BrowserWindow({
        width: 800,
        height: 800,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
        },
      });
  
      selectclasswindow.loadFile('HTML/selectclass.html');
  
        // 창이 닫힐 때 처리
        selectclasswindow.on('closed', () => {
          selectclasswindow = null; // 참조 제거
      });
    }
  });
});

