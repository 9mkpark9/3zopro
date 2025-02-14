const { contextBridge, ipcRenderer } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// 설정 파일 경로 (절대 경로 사용)
const configPath = path.resolve(__dirname, 'config.json');
console.log('Config path:', configPath);

// Python 프로세스 관리를 위한 변수
let pythonProcess = null;

// 설정 로드 함수
function loadConfig() {
    try {
        const rawConfig = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(rawConfig);
    } catch (error) {
        console.error('설정 파일 로드 실패:', error);
        // 기본 설정값 수정
        return {
            serverUrl: "127.0.0.1",
            serverPort: "9000",      // Flask 서버 포트로 수정
            DBserverUrl: "127.0.0.1",
            DBserverPort: "3306",    // MySQL 포트로 수정
            ReIDserverUrl: "127.0.0.1",
            ReIDserverPort: "5000"
        };
    }
}

// 설정 로드
const config = loadConfig();
console.log('Loaded config:', config);

// API 노출
contextBridge.exposeInMainWorld(
    'config',
    {
        serverUrl: config.serverUrl,
        serverPort: config.serverPort,
        DBserverUrl: config.DBserverUrl,
        DBserverPort: config.DBserverPort,
        ReIDserverUrl: config.ReIDserverUrl,
        ReIDserverPort: config.ReIDserverPort,
        getConfig: () => config
    }
);

// Python 스크립트 실행 함수
function startPythonProcess() {
  const pythonPath = 'python';
  const scriptPath = path.join(__dirname, 'python', 'usercam', 'usercammain.py');
  
  pythonProcess = spawn(pythonPath, [scriptPath]);

  pythonProcess.stdout.on('data', (data) => {
    try {
      const lines = data.toString().split('\n').filter(line => line.trim());
      lines.forEach(line => {
        try {
          const result = JSON.parse(line);
          ipcRenderer.send('monitoring-data', result);
        } catch (e) {
          console.log('Python output:', line);
        }
      });
    } catch (e) {
      console.error('Error processing Python output:', e);
    }
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error('Python error:', data.toString());
  });

  pythonProcess.on('close', (code) => {
    console.log(`Python process exited with code ${code}`);
    pythonProcess = null;
  });
}

// 모든 API를 하나의 객체로 통합
contextBridge.exposeInMainWorld('electronAPI', {
  // ReID 관련 API
  invoke: async (channel, ...args) => {
    const validChannels = [
      'start-reid',
      'stop-reid',
      'get-reid-frame',
      'show-reid-monitoring',
      'capture-objects',
      'recognize-objects'
    ];
    if (validChannels.includes(channel)) {
      return await ipcRenderer.invoke(channel, ...args);
    }
  },
  startReid: () => ipcRenderer.invoke('start-reid'),
  stopReid: () => ipcRenderer.invoke('stop-reid'),
  showReidMonitoring: () => ipcRenderer.invoke('show-reid-monitoring'),
  getReidFrame: () => ipcRenderer.invoke('get-reid-frame'),
  updateMemberName: (data) => ipcRenderer.invoke('updateMemberName', data),
  
  // 모니터링 관련 API
  startMonitoring: () => {
    console.log('모니터링 시작 요청됨');
    if (!pythonProcess) {
      startPythonProcess();
    }
  },
  stopMonitoring: () => {
    console.log('모니터링 중지 요청됨');
    if (pythonProcess) {
      // ESC 키 이벤트 시뮬레이션
      pythonProcess.stdin.write('\x1b');
      pythonProcess.kill();
      pythonProcess = null;
    }
  },
  onMonitoringData: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('monitoring-data', listener);
    // 리스너 제거 함수 반환
    return () => {
      ipcRenderer.removeListener('monitoring-data', listener);
    };
  },
  
  // 최종 점수 표시 함수 추가
  showFinalScore: () => {
    if (pythonProcess) {
        console.log('ESC 명령 전송');
        pythonProcess.stdin.write('\x1b');  // ESC 키 전송
        pythonProcess.stdin.end();  // 입력 버퍼 비우기
    }
  },
  
  pauseMonitoring: () => {
    if (pythonProcess) {
      console.log('일시 중지 명령 전송');
      pythonProcess.stdin.write('p');  // 일시정지 명령
      pythonProcess.stdin.end();  // 입력 버퍼 비우기
    }
  },
  
  resumeMonitoring: () => {
    if (pythonProcess) {
      console.log('재개 명령 전송');
      pythonProcess.stdin.write('r');  // 재개 명령
      pythonProcess.stdin.end();  // 입력 버퍼 비우기
    }
  },
  
  // ESC 키 시뮬레이션 함수
  sendEscapeSignal: () => ipcRenderer.invoke('send-escape-signal')
});
