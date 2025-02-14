class GradeManager {
    constructor() {
        this.SERVER_URL = `http://${window.config.serverUrl}:${window.config.serverPort}`;
        this.currentUser = JSON.parse(localStorage.getItem('currentUser'));
        this.gradeChart = null;
        
        // 이미 인스턴스가 있는지 확인
        if (window.gradeManagerInstance) {
            return window.gradeManagerInstance;
        }
        window.gradeManagerInstance = this;
        
        this.initializeGradeSystem();
    }

    async initializeGradeSystem() {
        try {
            // 차트 초기화를 먼저 수행
            this.setupGradeChart();
            
            // 강의 목록 로드 및 이벤트 리스너 설정
            await this.loadCourses();
            this.setupEventListeners();
            
            // 페이지 전환 이벤트 리스너
            document.querySelectorAll('.sidebar-nav li').forEach(item => {
                item.addEventListener('click', async (e) => {
                    if (e.currentTarget.dataset.page === 'grades') {
                        // 성적 페이지로 전환 시 차트 재초기화 및 데이터 로드
                        this.setupGradeChart();
                        const courseSelect = document.getElementById('courseSelect');
                        if (courseSelect) {
                            await this.loadGradeData(courseSelect.value);
                        }
                    }
                });
            });
        } catch (error) {
            console.error('성적 관리 시스템 초기화 실패:', error);
        }
    }

    // 교수의 강의 목록 불러오기
    async loadCourses() {
        try {
            // 현재 교수의 강의 목록을 가져옴
            const response = await fetch(`${this.SERVER_URL}/api/professor/courses/${this.currentUser.id}`);
            const data = await response.json();
            
            // 응답 데이터 구조 확인 및 처리
            const courses = Array.isArray(data) ? data : 
                           Array.isArray(data.courses) ? data.courses : 
                           [];
            
            console.log('Received courses:', courses); // 디버깅용

            const courseSelect = document.getElementById('courseSelect');
            if (!courseSelect) {
                console.error('courseSelect element not found');
                return;
            }

            courseSelect.innerHTML = '<option value="">전체 과목</option>' +
                courses.map(course => `
                    <option value="${course.c_id || course.id}">${course.c_name || course.name}</option>
                `).join('');

            if (courses.length > 0) {
                await this.loadGradeData(courses[0].c_id || courses[0].id);
            }
        } catch (error) {
            console.error('강의 목록 로드 실패:', error);
            console.log('Error details:', {
                message: error.message,
                stack: error.stack
            });
        }
    }

    // 성적 데이터 불러오기
    async loadGradeData(courseId) {
        try {
            let gradeData, gradeDistribution;
            
            if (courseId === '') {
                // 전체 과목 선택 시
                const response = await fetch(`${this.SERVER_URL}/api/grades/all/${this.currentUser.id}`);
                const data = await response.json();
                gradeData = data.gradeData || [];
                gradeDistribution = data.gradeDistribution || this.getEmptyDistribution();
                console.log('전체 과목 데이터:', data); // 디버깅용
            } else {
                // 특정 과목 선택 시
                const response = await fetch(`${this.SERVER_URL}/api/grades/course/${courseId}`);
                const data = await response.json();
                gradeData = data.gradeData || [];
                // 특정 과목의 경우 과목명 추가
                gradeData = gradeData.map(student => ({
                    ...student,
                    course_name: document.querySelector(`#courseSelect option[value="${courseId}"]`)?.textContent || '-'
                }));
                gradeDistribution = data.gradeDistribution || this.getEmptyDistribution();
                console.log('특정 과목 데이터:', data); // 디버깅용
            }

            console.log('가공된 성적 데이터:', { gradeData, gradeDistribution });
            
            this.updateGradeTable(gradeData);
            this.updateGradeChart(gradeDistribution);
        } catch (error) {
            console.error('성적 데이터 로드 실패:', error);
            this.updateGradeTable([]);
            this.updateGradeChart(this.getEmptyDistribution());
        }
    }

    // 빈 분포 객체 반환 메서드 추가
    getEmptyDistribution() {
        return {
            'A+': 0, 'A0': 0, 'B+': 0, 'B0': 0,
            'C+': 0, 'C0': 0, 'D+': 0, 'D0': 0, 'F': 0
        };
    }

    // 성적 테이블 업데이트
    updateGradeTable(gradeData) {
        const tbody = document.querySelector('.grades-table tbody');
        if (!tbody) {
            console.error('grades-table tbody element not found');
            return;
        }

        if (!gradeData || gradeData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="no-data">데이터가 없습니다.</td></tr>';
            return;
        }

        tbody.innerHTML = gradeData.map(student => `
            <tr>
                <td>${student.s_id || '-'}</td>
                <td>${student.name || '-'}</td>
                <td>${student.course_name || '-'}</td>
                <td>${student.midterm_score || '0'}</td>
                <td>${student.final_score || '0'}</td>
                <td>${student.assignment_score || '0'}</td>
                <td>${student.attendance_score || '0'}</td>
                <td>${student.total_score || '0'}</td>
                <td>${student.grade || '-'}</td>
            </tr>
        `).join('');
    }

    // 성적 분포 차트 설정
    setupGradeChart() {
        const ctx = document.getElementById('gradeDistributionChart');
        if (!ctx) {
            console.error('gradeDistributionChart canvas not found');
            return;
        }

        // 현재 테마 확인
        const isDarkMode = document.querySelector('input[name="theme"][value="dark"]').checked;
        const textColor = isDarkMode ? '#ffffff' : '#333333';

        // 이전 차트가 있다면 제거
        if (this.gradeChart) {
            this.gradeChart.destroy();
            this.gradeChart = null;
        }

        try {
            // 새로운 차트 생성
            this.gradeChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['A+', 'A0', 'B+', 'B0', 'C+', 'C0', 'D+', 'D0', 'F'],
                    datasets: [{
                        label: '학생 수',
                        data: [0, 0, 0, 0, 0, 0, 0, 0, 0],
                        backgroundColor: [
                            'rgba(75, 192, 192, 0.8)',  // A+ (청록색)
                            'rgba(75, 192, 192, 0.6)',  // A0
                            'rgba(54, 162, 235, 0.8)',  // B+ (파란색)
                            'rgba(54, 162, 235, 0.6)',  // B0
                            'rgba(255, 206, 86, 0.8)',  // C+ (노란색)
                            'rgba(255, 206, 86, 0.6)',  // C0
                            'rgba(255, 159, 64, 0.8)',  // D+ (주황색)
                            'rgba(255, 159, 64, 0.6)',  // D0
                            'rgba(255, 99, 132, 0.8)',  // F (빨간색)
                        ],
                        borderColor: [
                            'rgba(75, 192, 192, 1)',
                            'rgba(75, 192, 192, 1)',
                            'rgba(54, 162, 235, 1)',
                            'rgba(54, 162, 235, 1)',
                            'rgba(255, 206, 86, 1)',
                            'rgba(255, 206, 86, 1)',
                            'rgba(255, 159, 64, 1)',
                            'rgba(255, 159, 64, 1)',
                            'rgba(255, 99, 132, 1)',
                        ],
                        borderWidth: 1,
                        borderRadius: 5
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false,
                            labels: {
                                color: textColor
                            }
                        },
                        title: {
                            display: true,
                            text: '학점 별 학생 분포',
                            color: textColor,
                            font: {
                                size: 16,
                                weight: 'bold'
                            },
                            padding: 20
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return `${context.parsed.y}명 (${((context.parsed.y / context.dataset.data.reduce((a, b) => a + b)) * 100).toFixed(1)}%)`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1,
                                color: textColor,
                                font: {
                                    size: 12
                                }
                            },
                            grid: {
                                display: true,
                                color: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
                            },
                            title: {
                                display: true,
                                text: '학생 수',
                                color: textColor,
                                font: {
                                    size: 14
                                }
                            }
                        },
                        x: {
                            grid: {
                                display: false
                            },
                            ticks: {
                                color: textColor,
                                font: {
                                    size: 12,
                                    weight: 'bold'
                                }
                            }
                        }
                    },
                    animation: {
                        duration: 1000,
                        easing: 'easeInOutQuart'
                    }
                }
            });

            // 테마 변경 이벤트 리스너 추가
            document.querySelectorAll('input[name="theme"]').forEach(input => {
                input.addEventListener('change', () => {
                    this.setupGradeChart();
                    // 현재 데이터 유지
                    if (this.gradeChart) {
                        const currentData = this.gradeChart.data.datasets[0].data;
                        this.updateGradeChart({
                            'A+': currentData[0], 'A0': currentData[1],
                            'B+': currentData[2], 'B0': currentData[3],
                            'C+': currentData[4], 'C0': currentData[5],
                            'D+': currentData[6], 'D0': currentData[7],
                            'F': currentData[8]
                        });
                    }
                });
            });

        } catch (error) {
            console.error('차트 초기화 실패:', error);
        }
    }

    // 성적 분포 차트 업데이트
    updateGradeChart(gradeDistribution) {
        if (!this.gradeChart) {
            this.setupGradeChart();
            if (!this.gradeChart) {
                console.error('Chart initialization failed');
                return;
            }
        }

        try {
            const data = ['A+', 'A0', 'B+', 'B0', 'C+', 'C0', 'D+', 'D0', 'F'].map(grade => 
                gradeDistribution[grade] || 0
            );

            this.gradeChart.data.datasets[0].data = data;
            this.gradeChart.update();
        } catch (error) {
            console.error('차트 업데이트 실패:', error);
        }
    }

    // 이벤트 리스너 설정
    setupEventListeners() {
        const courseSelect = document.getElementById('courseSelect');
        if (courseSelect) {
            courseSelect.addEventListener('change', (e) => {
                // 전체 과목이든 특정 과목이든 모두 loadGradeData 호출
                this.loadGradeData(e.target.value);
            });
        }
    }
}

// DOM이 로드되면 GradeManager 인스턴스 생성
document.addEventListener('DOMContentLoaded', () => {
    if (!window.gradeManagerInstance) {
        new GradeManager();
    }
}); 