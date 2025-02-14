class WeeklyGradeManager {
    constructor() {
        this.SERVER_URL = `http://${window.config.serverUrl}:${window.config.serverPort}`;
        this.currentUser = JSON.parse(localStorage.getItem('currentUser'));
        this.concentrationChart = null;
        this.currentCourseId = null;
        this.initializeSystem();
    }

    async initializeSystem() {
        try {
            await this.loadCourses();
            this.setupEventListeners();
            this.setupConcentrationChart();
        } catch (error) {
            console.error('주차별 성적 시스템 초기화 실패:', error);
        }
    }

    async loadCourses() {
        try {
            const response = await fetch(`${this.SERVER_URL}/api/professor/courses/${this.currentUser.id}`);
            const data = await response.json();
            
            const courses = Array.isArray(data) ? data : 
                          Array.isArray(data.courses) ? data.courses : 
                          [];

            const courseSelect = document.getElementById('weeklyGradeCourseSelect');
            if (!courseSelect) return;

            courseSelect.innerHTML = '<option value="">과목 선택</option>' +
                courses.map(course => `
                    <option value="${course.c_id || course.id}">${course.c_name || course.name}</option>
                `).join('');
        } catch (error) {
            console.error('강의 목록 로드 실패:', error);
        }
    }

    async loadWeeklyData(courseId) {
        try {
            const response = await fetch(`${this.SERVER_URL}/api/weekly-grades/course/${courseId}`);
            const data = await response.json();
            console.log('주차별 데이터:', data); // 디버깅용

            if (!Array.isArray(data)) {
                console.error('서버 응답이 배열 형식이 아닙니다:', data);
                this.updateWeeklyTable([]);
                return;
            }

            // 데이터 형식 검증 및 변환
            const formattedData = data.map(student => ({
                s_id: student.s_id,
                name: student.name,
                course_name: student.course_name,
                avg_concentration: student.avg_concentration,
                attendance_rate: student.attendance_rate
            }));

            this.updateWeeklyTable(formattedData);
        } catch (error) {
            console.error('주차별 데이터 로드 실패:', error);
            this.updateWeeklyTable([]);
        }
    }

    async loadStudentDetail(courseId, studentId) {
        try {
            const response = await fetch(
                `${this.SERVER_URL}/api/weekly-grades/detail/${courseId}/${studentId}`
            );
            const data = await response.json();
            console.log('학생 상세 데이터:', data); // 디버깅용

            if (!data.weeklyData || !Array.isArray(data.weeklyData)) {
                console.error('유효하지 않은 주차별 데이터:', data);
                return;
            }

            this.updateDetailView(data);
        } catch (error) {
            console.error('학생 상세 데이터 로드 실패:', error);
        }
    }

    updateWeeklyTable(data) {
        const tbody = document.querySelector('.weekly-grades-table tbody');
        if (!tbody) return;

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="no-data">데이터가 없습니다.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(student => `
            <tr data-student-id="${student.s_id}">
                <td>${student.s_id || '-'}</td>
                <td>${student.name || '-'}</td>
                <td>${student.course_name || '-'}</td>
                <td>${this.convertToScore(student.avg_concentration)}점</td>
                <td>${this.convertToScore(student.attendance_rate)}점</td>
                <td>
                    <button class="btn btn-detail" data-student-id="${student.s_id}">
                        상세보기
                    </button>
                </td>
            </tr>
        `).join('');

        // 데이터가 있는 경우 첫 번째 학생의 상세 정보를 자동으로 표시
        if (data.length > 0) {
            const firstStudentId = data[0].s_id;
            this.loadStudentDetail(this.currentCourseId, firstStudentId);
        }
    }

    setupConcentrationChart() {
        const ctx = document.getElementById('weeklyConcentrationChart');
        if (!ctx) return;

        if (this.concentrationChart) {
            this.concentrationChart.destroy();
        }

        this.concentrationChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: '주차별 집중도',
                    data: [],
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    }

    updateDetailView(data) {
        // 테이블 업데이트
        const tbody = document.querySelector('.weekly-detail-table tbody');
        if (tbody) {
            tbody.innerHTML = data.weeklyData.map(week => {
                // 출석 상태에 따른 스타일 클래스 설정
                const statusClass = {
                    '출석': 'status-present',
                    '지각': 'status-late',
                    '결석': 'status-absent'
                }[week.attendance_status] || '';

                return `
                    <tr>
                        <td>${week.week}주차</td>
                        <td>${week.date || '-'}</td>
                        <td>${week.concentration.toFixed(1)}점</td>
                        <td class="${statusClass}">${week.attendance_status}</td>
                    </tr>
                `;
            }).join('');
        }

        // 차트 업데이트
        if (this.concentrationChart) {
            const weeklyData = data.weeklyData;
            
            this.concentrationChart.data.labels = weeklyData.map(week => `${week.week}주차`);
            this.concentrationChart.data.datasets[0].data = weeklyData.map(week => week.concentration);
            
            // 차트 옵션 업데이트
            this.concentrationChart.options = {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: '집중도 (점)'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: '주차'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `집중도: ${context.parsed.y.toFixed(1)}점`;
                            }
                        }
                    }
                }
            };
            
            this.concentrationChart.update();
        }
    }

    setupEventListeners() {
        // 과목 선택 이벤트
        const courseSelect = document.getElementById('weeklyGradeCourseSelect');
        if (courseSelect) {
            courseSelect.addEventListener('change', (e) => {
                const courseId = e.target.value;
                if (courseId) {
                    this.currentCourseId = courseId;
                    this.loadWeeklyData(courseId);
                }
            });
        }

        // 상세보기 버튼 클릭 이벤트 - 테이블이 존재할 때만 이벤트 추가
        const weeklyTable = document.querySelector('.weekly-grades-table');
        if (weeklyTable) {
            weeklyTable.addEventListener('click', (e) => {
                if (e.target.classList.contains('btn-detail')) {
                    const studentId = e.target.dataset.studentId;
                    this.showStudentDetail(studentId);
                }
            });
        }

        // 모달 관련 이벤트
        const modal = document.getElementById('studentDetailModal');
        if (modal) {
            const closeBtn = modal.querySelector('.close-modal');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    modal.style.display = 'none';
                });
            }

            // 모달 외부 클릭 시 닫기
            modal.addEventListener('click', (e) => {
                if (e.target === modal || e.target.classList.contains('modal-backdrop')) {
                    modal.style.display = 'none';
                }
            });
        }
    }

    async showStudentDetail(studentId) {
        const modal = document.getElementById('studentDetailModal');
        
        try {
            // 모달 표시 및 body 스크롤 방지
            modal.style.display = 'block';
            document.body.classList.add('modal-open');
            
            // 학생 정보 업데이트
            if (this.currentCourseId) {
                const student = await this.getStudentInfo(studentId);
                
                // 학생 정보 헤더 업데이트
                document.getElementById('studentName').textContent = student.name;
                document.getElementById('studentId').textContent = student.s_id;
                document.getElementById('courseName').textContent = student.course_name;
                
                await this.loadStudentDetail(this.currentCourseId, studentId);
            }
            
            // ESC 키로 모달 닫기
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    this.closeModal();
                    document.removeEventListener('keydown', handleEscape);
                }
            };
            document.addEventListener('keydown', handleEscape);
            
            // 모달 외부 클릭 시 닫기
            modal.addEventListener('click', (e) => {
                if (e.target === modal || e.target.classList.contains('modal-backdrop')) {
                    this.closeModal();
                }
            });
        } catch (error) {
            console.error('학생 상세 정보 로드 실패:', error);
        }
    }

    // 모달 닫기 함수
    closeModal() {
        const modal = document.getElementById('studentDetailModal');
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
    }

    // 학생 정보 가져오기
    async getStudentInfo(studentId) {
        try {
            // 현재 선택된 과목의 정보 가져오기
            const courseSelect = document.getElementById('weeklyGradeCourseSelect');
            const courseName = courseSelect.options[courseSelect.selectedIndex].text;

            // 현재 테이블에서 해당 학생의 정보 찾기
            const studentRow = document.querySelector(`.weekly-grades-table tr[data-student-id="${studentId}"]`);
            if (studentRow) {
                return {
                    s_id: studentId,
                    name: studentRow.cells[1].textContent,
                    course_name: courseName
                };
            }

            // 테이블에서 찾지 못한 경우 API 호출
            const response = await fetch(`${this.SERVER_URL}/api/student/${studentId}`);
            const data = await response.json();
            return {
                ...data,
                course_name: courseName
            };
        } catch (error) {
            console.error('학생 정보 로드 실패:', error);
            return {
                s_id: studentId,
                name: '알 수 없음',
                course_name: '알 수 없음'
            };
        }
    }

    // percentage가 숫자나 문자열 모두 처리할 수 있도록 수정
    convertToScore(percentage) {
        // 입력값이 없거나 유효하지 않은 경우
        if (percentage === undefined || percentage === null) {
            return '0.0';
        }
        
        // 이미 숫자인 경우
        if (typeof percentage === 'number') {
            return percentage.toFixed(1);
        }
        
        // 문자열인 경우 '%' 제거하고 숫자로 변환
        const value = parseFloat(percentage.toString().replace('%', ''));
        return isNaN(value) ? '0.0' : value.toFixed(1);
    }
}

// DOM이 로드되면 WeeklyGradeManager 인스턴스 생성
document.addEventListener('DOMContentLoaded', () => {
    new WeeklyGradeManager();
}); 