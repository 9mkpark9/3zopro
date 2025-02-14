const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let reidProcess = null;
let isMonitoring = false;

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1800,
        height: 1000,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: true,
            enableRemoteModule: true,
            preload: path.join(__dirname, 'preload.js'),
            sandbox: false
        },
        icon: path.join(__dirname, 'src', 'assets', 'win_icon.png')
    });


    mainWindow.loadFile(path.join(__dirname, 'src', 'login', 'index.html'));
}

// Electron 초기화
app.whenReady().then(() => {
    createWindow();

    // IPC 핸들러 등록
    ipcMain.handle('start-reid', async () => {
        if (reidProcess) {
            return { success: false, error: 'ReID 프로세스가 이미 실행 중입니다.' };
        }

        try {
            const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
            const scriptPath = path.join(__dirname, 'python', 'ReID', 'ReID.py');
            
            console.log('Python 경로:', pythonPath);
            console.log('스크립트 경로:', scriptPath);

            reidProcess = spawn(pythonPath, [scriptPath], {
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true,
                cwd: path.join(__dirname, 'python'),  // 작업 디렉토리 설정
                env: {
                    ...process.env,
                    PYTHONIOENCODING: 'utf-8',
                    PYTHONUTF8: '1',
                    LANG: 'ko_KR.UTF-8',
                    LC_ALL: 'ko_KR.UTF-8',
                    PYTHONUNBUFFERED: '1'  // Python 출력 버퍼링 비활성화
                }
            });

            // 프로세스 종료 이벤트 처리
            reidProcess.on('exit', (code, signal) => {
                console.log(`ReID 프로세스 종료 - 코드: ${code}, 시그널: ${signal}`);
                reidProcess = null;
            });

            // 에러 이벤트 처리
            reidProcess.on('error', (err) => {
                console.error('ReID 프로세스 에러:', err);
                reidProcess = null;
            });

            // 데이터 수신 시 인코딩 설정
            reidProcess.stdout.setEncoding('utf-8');
            reidProcess.stderr.setEncoding('utf-8');

            // 디버그를 위한 에러 출력 추가
            reidProcess.stderr.on('data', (data) => {
                console.log('Python stderr:', data.toString());
            });

            // 초기화 완료 대기
            await new Promise((resolve, reject) => {
                let initData = '';
                let errorData = '';
                
                reidProcess.stdout.on('data', (data) => {
                    console.log('Python stdout:', data.toString());
                    initData += data.toString();
                    if (initData.includes('INIT_COMPLETE')) {
                        resolve();
                    }
                });

                reidProcess.stderr.on('data', (data) => {
                    errorData += data.toString();
                    console.error(`ReID 에러: ${data}`);
                });

                // 30초 타임아웃 (초기화에 시간이 더 필요할 수 있음)
                setTimeout(() => {
                    reject(new Error(`초기화 시간 초과\n에러: ${errorData}`));
                }, 30000);
            });

            console.log('ReID 시스템 초기화 완료');
            return { 
                success: true, 
                message: 'ReID 시스템이 시작되었습니다.',
                pid: reidProcess.pid 
            };
        } catch (error) {
            console.error('ReID 시작 오류:', error);
            if (reidProcess) {
                reidProcess.kill();
                reidProcess = null;
            }
            return { success: false, error: 'ReID 시스템 시작 실패' };
        }
    });

    ipcMain.handle('stop-reid', async () => {
        if (!reidProcess) {
            return { success: false, error: 'ReID 프로세스가 실행 중이지 않습니다.' };
        }

        try {
            if (process.platform === 'win32') {
                spawn('taskkill', ['/pid', reidProcess.pid, '/f', '/t']);
            } else {
                process.kill(-reidProcess.pid);
            }
            reidProcess = null;
            return { success: true, message: 'ReID 시스템이 종료되었습니다.' };
        } catch (error) {
            console.error('ReID 종료 오류:', error);
            return { success: false, error: 'ReID 시스템 종료 실패' };
        }
    });

    ipcMain.handle('show-reid-monitoring', async () => {
        if (!reidProcess) {
            return { success: false, error: 'ReID 프로세스가 실행중이지 않습니다.' };
        }

        try {
            // ReID 프로세스에 모니터링 모드 전환 신호 전송
            reidProcess.stdin.write('SHOW_MONITORING\n');
            return { success: true };
        } catch (error) {
            console.error('모니터링 모드 전환 오류:', error);
            return { success: false, error: '모니터링 모드 전환 실패' };
        }
    });

    ipcMain.handle('get-reid-frame', async () => {
        if (!reidProcess) {
            return { success: false, error: 'ReID process is not running' };
        }

        try {
            const frameData = await new Promise((resolve, reject) => {
                let responseData = '';

                const dataHandler = (data) => {
                    responseData += data.toString();
                    try {
                        const result = JSON.parse(responseData);
                        cleanup();
                        resolve(result);
                    } catch (e) {
                        // Continue collecting data
                    }
                };

                const errorHandler = (error) => {
                    cleanup();
                    reject(error);
                };

                const cleanup = () => {
                    reidProcess.stdout.removeListener('data', dataHandler);
                    reidProcess.removeListener('error', errorHandler);
                };

                reidProcess.stdout.on('data', dataHandler);
                reidProcess.on('error', errorHandler);

                // Send command
                reidProcess.stdin.write('GET_FRAME\n');

                // Set timeout
                setTimeout(() => {
                    cleanup();
                    reject(new Error('Frame data receive timeout'));
                }, 3000);
            });

            return {
                success: true,
                frame: frameData.frame,
                detections: frameData.detections,
                stats: frameData.stats,
                members: frameData.members,
                logs: frameData.logs
            };
        } catch (error) {
            console.error('Frame data receive error:', error);
            return { success: false, error: 'Frame data receive failed' };
        }
    });

    // 객체 캡처 핸들러
    ipcMain.handle('capture-objects', async () => {
        if (!reidProcess) {
            return { success: false, error: 'ReID process is not running' };
        }

        try {
            reidProcess.stdin.write('CAPTURE\n');
            const response = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    cleanup();
                    reject(new Error('Capture timeout'));
                }, 3000);

                const dataHandler = (data) => {
                    try {
                        const result = JSON.parse(data.toString());
                        if (result.hasOwnProperty('success')) {  // success 속성이 있는 응답만 처리
                            cleanup();
                            resolve(result);
                        }
                    } catch (e) {
                        // JSON 파싱 실패는 무시 (다른 출력일 수 있음)
                    }
                };

                const cleanup = () => {
                    clearTimeout(timeout);
                    reidProcess.stdout.removeListener('data', dataHandler);
                };

                reidProcess.stdout.on('data', dataHandler);
            });

            return response;
        } catch (error) {
            console.error('Capture error:', error);
            return { success: false, error: 'Capture failed' };
        }
    });

    // 객체 인식 핸들러
    ipcMain.handle('recognize-objects', async () => {
        if (!reidProcess) {
            return { success: false, error: 'ReID process is not running' };
        }

        try {
            reidProcess.stdin.write('RECOGNIZE\n');
            const response = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    cleanup();
                    reject(new Error('Recognition timeout'));
                }, 3000);

                const dataHandler = (data) => {
                    try {
                        const result = JSON.parse(data.toString());
                        if (result.hasOwnProperty('success')) {  // success 속성이 있는 응답만 처리
                            cleanup();
                            resolve(result);
                        }
                    } catch (e) {
                        // JSON 파싱 실패는 무시 (다른 출력일 수 있음)
                    }
                };

                const cleanup = () => {
                    clearTimeout(timeout);
                    reidProcess.stdout.removeListener('data', dataHandler);
                };

                reidProcess.stdout.on('data', dataHandler);
            });

            return response;
        } catch (error) {
            console.error('Recognition error:', error);
            return { success: false, error: 'Recognition failed' };
        }
    });

    ipcMain.handle('updateMemberName', async (event, data) => {
        if (!reidProcess) {
            return { success: false, error: 'ReID process is not running' };
        }

        try {
            // Python 프로세스에 이름 업데이트 명령 전송
            reidProcess.stdin.write(`UPDATE_NAME:${data.id},${data.name}\n`);
            
            const response = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    cleanup();
                    reject(new Error('Name update timeout'));
                }, 3000);

                const dataHandler = (data) => {
                    try {
                        const result = JSON.parse(data.toString());
                        if (result.hasOwnProperty('success')) {
                            cleanup();
                            resolve(result);
                        }
                    } catch (e) {
                        // JSON 파싱 실패는 무시
                    }
                };

                const cleanup = () => {
                    clearTimeout(timeout);
                    reidProcess.stdout.removeListener('data', dataHandler);
                };

                reidProcess.stdout.on('data', dataHandler);
            });

            return response;
        } catch (error) {
            console.error('Error updating member name:', error);
            return { success: false, error: error.message };
        }
    });

    // 앱 종료 시 ReID 프로세스도 함께 종료
    app.on('before-quit', () => {
        if (reidProcess) {
            try {
                if (process.platform === 'win32') {
                    spawn('taskkill', ['/pid', reidProcess.pid, '/f', '/t']);
                } else {
                    process.kill(-reidProcess.pid);
                }
            } catch (error) {
                console.error('프로세스 종료 중 오류:', error);
            }
        }
    });

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    // IPC 이벤트 핸들러 등록
    ipcMain.on('monitoring-data', (event, data) => {
        // 모든 윈도우에 데이터 전달
        BrowserWindow.getAllWindows().forEach(window => {
            window.webContents.send('monitoring-data', data);
        });
    });

    // ESC 키 시뮬레이션 처리
    ipcMain.handle('send-escape-signal', async () => {
        try {
            if (reidProcess) {
                // 파이썬 프로세스에 ESC 키 시뮬레이션 신호 전송
                reidProcess.stdin.write('ESC\n');
                return { success: true };
            }
            throw new Error('파이썬 프로세스가 실행 중이지 않습니다.');
        } catch (error) {
            console.error('ESC 신호 전송 중 오류:', error);
            throw error;
        }
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});
