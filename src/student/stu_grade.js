document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM 로드됨');
    // 현재 로그인한 학생 정보 가져오기
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const SERVER_URL = `http://${window.config.serverUrl}:${window.config.serverPort}`;

    // 학점 계산 함수 추가
    function calculateGrade(totalScore) {
        if (totalScore >= 95) return 'A+';
        else if (totalScore >= 90) return 'A';
        else if (totalScore >= 85) return 'B+';
        else if (totalScore >= 80) return 'B';
        else if (totalScore >= 75) return 'C+';
        else if (totalScore >= 70) return 'C';
        else if (totalScore >= 65) return 'D+';
        else if (totalScore >= 60) return 'D';
        else return 'F';
    }

    function calculateGradeLevel(score) {
        if (score >= 80) return { grade: 'A', color: '#2196F3' };
        else if (score >= 60) return { grade: 'B', color: '#4CAF50' };
        else if (score >= 40) return { grade: 'C', color: '#FFC107' };
        else return { grade: 'D', color: '#FF9800' };
    }

    // 학생이 신청한 과목 목록을 가져오는 함수
    async function fetchEnrolledCourses() {
        try {
            const response = await fetch(`${SERVER_URL}/api/student/grades/courses/${currentUser.id}`);
            if (!response.ok) {
                throw new Error('과목 목록을 불러오는데 실패했습니다.');
            }
            const data = await response.json();
            console.log("서버 응답 데이터:", data);  // 전체 응답 데이터 확인
            console.log("과목 목록:", data.courses);  // courses 배열 확인
            updateCourseFilter(data.courses);
        } catch (error) {
            console.error('과목 목록 조회 오류:', error);
            alert('과목 목록을 불러오는데 실패했습니다.');
        }
    }

    // 과목 선택 콤보 박스 업데이트 함수
    function updateCourseFilter(courses) {
        const courseFilter = document.querySelector('.grade-filters #courseFilter');
        console.log('courseFilter 요소:', courseFilter);  // null인지 확인
        if (!courseFilter) return;

        // 기존 옵션 제거
        courseFilter.innerHTML = '<option value="">과목 선택</option>';

        // 신청한 과목들을 콤보 박스에 추가
        courses.forEach(course => {
            console.log("과목 데이터:", course);
            const option = document.createElement('option');
            option.value = course.id;
            option.textContent = course.name;
            console.log('옵션 추가:', option.textContent);  // 옵션이 생성되는지 확인
            courseFilter.appendChild(option);
        });
        console.log('최종 콤보박스 내용:', courseFilter.innerHTML);  // 최종 결과 확인
    }

    // 과목 필터 이벤트 리스너
    const courseFilter = document.querySelector('.grade-filters #courseFilter');
    if (courseFilter) {
        courseFilter.addEventListener('change', async (e) => {
            const selectedCourseId = e.target.value;
            if (!selectedCourseId) {
                updateWeeklyGradeTable([]); // 과목 미선택시 빈 테이블
                return;
            }

            try {
                // 선택한 과목의 주차별 성적 데이터 가져오기
                const response = await fetch(`${SERVER_URL}/api/student/grades/weekly/${currentUser.id}/${selectedCourseId}`);
                if (!response.ok) {
                    throw new Error('성적 데이터를 불러오는데 실패했습니다.');
                }
                const gradeData = await response.json();
                console.log("주차별 성적 데이터:", gradeData);  // 데이터 확인
                updateWeeklyGradeTable(gradeData);
            } catch (error) {
                console.error('성적 데이터 조회 오류:', error);
                alert('성적 데이터를 불러오는데 실패했습니다.');
            }
        });
    }

    // 출석 상태 텍스트 변환 함수
    function getAttendanceStatus(status) {
        let displayStatus = status;
        let statusClass = '';

        if (status === 'present' || status === '출석') {
            displayStatus = '출석';
            statusClass = 'status-present';
        }
        else if (status === 'late' || status === '지각') {
            displayStatus = '지각';
            statusClass = 'status-late';
        }
        else if (status === 'absent' || status === '결석') {
            displayStatus = '결석';
            statusClass = 'status-absent';
        }
        else if (status === 'pending' || status === '미출결') {
            displayStatus = '미출결';
            statusClass = 'status-pending';
        }

        return { text: displayStatus, class: statusClass };
    }

    // 주차별 성적 테이블 업데이트 함수
    function updateWeeklyGradeTable(data) {
        const tbody = document.getElementById('weeklyGradeTableBody');
        if (!tbody) return;

        tbody.innerHTML = '';
        
        if (data.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="7" class="no-data">데이터가 없습니다.</td>';
            tbody.appendChild(row);
            return;
        }

        data.forEach(week => {
            const attendanceStatus = getAttendanceStatus(week.attendance);
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${week.week}주차</td>
                <td>${formatDate(week.date)}</td>
                <td>
                    <div class="score-fraction">
                        <span class="score-value">${week.blinkScore || '-'}</span>
                        <span class="score-divider">/</span>
                        <span class="score-total">100</span>
                    </div>
                </td>
                <td>
                    <div class="score-fraction">
                        <span class="score-value">${week.concentrationScore || '-'}</span>
                        <span class="score-divider">/</span>
                        <span class="score-total">100</span>
                    </div>
                </td>
                <td>
                    <div class="score-fraction">
                        <span class="score-value">${week.headPositionScore || '-'}</span>
                        <span class="score-divider">/</span>
                        <span class="score-total">100</span>
                    </div>
                </td>
                <td class="total-score">${week.total || '-'}</td>
                <td>
                    <span class="attendance-badge ${attendanceStatus.class}">
                        ${attendanceStatus.text}
                    </span>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    // 날짜 포맷 함수
    function formatDate(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    // 총 평균 점수 테이블 생성 및 데이터 표시 함수
    async function displayAverageGrades() {
        try {
            const averageGradesContainer = document.querySelector('.average-grades-container');
            if (!averageGradesContainer) return;

            // 로딩 상태 표시
            averageGradesContainer.innerHTML = '<div class="loading">데이터를 불러오는 중...</div>';

            const response = await fetch(`${SERVER_URL}/api/student/grades/courses/${currentUser.id}`);
            if (!response.ok) {
                throw new Error('과목 목록을 불러오는데 실패했습니다.');
            }
            const data = await response.json();
            const courses = data.courses || data;
            console.log('서버에서 받은 과목 목록:', courses);

            // 각 과목별 성적 데이터 가져오기 및 평균 계산
            const averageGradesData = await Promise.all(courses.map(async (course) => {
                const courseId = course.c_id || course.id;
                const gradeResponse = await fetch(`${SERVER_URL}/api/student/grades/weekly/${currentUser.id}/${courseId}`);
                if (!gradeResponse.ok) {
                    throw new Error(`${course.c_name || course.name} 과목의 성적을 불러오는데 실패했습니다.`);
                }
                const grades = await gradeResponse.json();
                console.log(`${course.c_name || course.name} 과목의 주차별 성적:`, grades);

                // 미출결(pending) 상태의 데이터를 제외하고 평균 계산
                const validGrades = grades.filter(g => g.attendance !== 'pending');
                
                // 각 항목별 평균 점수 계산
                const averages = {
                    blinkScore: average(validGrades.map(g => g.blinkScore || 0)),
                    concentrationScore: average(validGrades.map(g => g.concentrationScore || 0)),
                    headPositionScore: average(validGrades.map(g => g.headPositionScore || 0))
                };

                // 총점 계산 (가중치 적용)
                averages.total = (
                    averages.blinkScore * 0.2 +        // 눈 깜빡임 20%
                    averages.concentrationScore * 0.3 + // 고개 돌림 30%
                    averages.headPositionScore * 0.5    // 졸음 50%
                );
                
                return {
                    ...course,
                    c_name: course.c_name || course.name,
                    professor_name: course.professor_name || course.professorName,
                    c_id: courseId,
                    averages,
                    validWeeks: validGrades.length // 유효한 데이터가 있는 주차 수
                };
            }));

            // 총점 기준으로 내림차순 정렬
            averageGradesData.sort((a, b) => b.averages.total - a.averages.total);

            // 테이블 생성 및 데이터 표시
            const averageGradesTable = document.createElement('table');
            averageGradesTable.className = 'average-grade-table';
            
            averageGradesTable.innerHTML = `
                <thead>
                    <tr>
                        <th>과목명</th>
                        <th>담당교수</th>
                        <th>졸음 (50점)</th>
                        <th>고개 돌림 (30점)</th>
                        <th>눈 깜빡임 (20점)</th>
                        <th>총점</th>
                        <th>등급</th>
                        <th>상세보기</th>
                    </tr>
                </thead>
                <tbody>
                    ${averageGradesData.map(course => {
                        const gradeLevel = calculateGradeLevel(course.averages.total);
                        return `
                            <tr>
                                <td>${course.c_name || course.name}</td>
                                <td>${course.professor_name || course.professorName}</td>
                                <td>
                                    <div class="score-fraction">
                                        <span class="score-value">${course.averages.headPositionScore.toFixed(1)}</span>
                                        <span class="score-divider">/</span>
                                        <span class="score-total">50</span>
                                    </div>
                                </td>
                                <td>
                                    <div class="score-fraction">
                                        <span class="score-value">${course.averages.concentrationScore.toFixed(1)}</span>
                                        <span class="score-divider">/</span>
                                        <span class="score-total">30</span>
                                    </div>
                                </td>
                                <td>
                                    <div class="score-fraction">
                                        <span class="score-value">${course.averages.blinkScore.toFixed(1)}</span>
                                        <span class="score-divider">/</span>
                                        <span class="score-total">20</span>
                                    </div>
                                </td>
                                <td class="total-score">${course.averages.total.toFixed(1)}</td>
                                <td>
                                    <span class="grade-badge" style="color: ${gradeLevel.color}">
                                        ${gradeLevel.grade}
                                    </span>
                                </td>
                                <td>
                                    <button class="btn btn-small btn-primary detail-btn" data-course-id="${course.c_id || course.id}">
                                        상세보기
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            `;

            // 테이블 추가 전에 컨테이너가 존재하는지 다시 확인
            if (averageGradesContainer) {
                averageGradesContainer.innerHTML = '';
                averageGradesContainer.appendChild(averageGradesTable);

                // 상세보기 버튼에 이벤트 리스너 추가
                const detailButtons = averageGradesContainer.querySelectorAll('.detail-btn');
                detailButtons.forEach(button => {
                    button.removeEventListener('click', handleDetailClick);
                    button.addEventListener('click', handleDetailClick);
                });
            }

        } catch (error) {
            console.error('총 평균 점수 표시 중 오류:', error);
            const averageGradesContainer = document.querySelector('.average-grades-container');
            if (averageGradesContainer) {
                averageGradesContainer.innerHTML = '<div class="error">데이터를 불러오는데 실패했습니다.</div>';
            }
        }
    }

    // 상세보기 버튼 클릭 핸들러 수정
    async function handleDetailClick() {
        const courseId = this.getAttribute('data-course-id');
        const courseName = this.closest('tr').querySelector('td:first-child').textContent;
        
        try {
            const response = await fetch(`${SERVER_URL}/api/student/grades/weekly/${currentUser.id}/${courseId}`);
            if (!response.ok) {
                throw new Error('성적 데이터를 불러오는데 실패했습니다.');
            }
            const gradeData = await response.json();
            
            // 모달의 주차별 성적 테이블 업데이트
            const modalTableBody = document.getElementById('modalGradeTableBody');
            modalTableBody.innerHTML = '';
            
            // 그래프 데이터 준비
            const weeks = [];
            const blinkScores = [];
            const concentrationScores = [];
            const headPositionScores = [];
            const totalScores = [];
            
            gradeData.forEach(week => {
                const attendanceStatus = getAttendanceStatus(week.attendance);
                const row = document.createElement('tr');
                
                // 점수 계산 - 결석은 0점, 지각은 70%, 미출결은 null
                const scores = {
                    concentration: week.attendance === 'absent' ? 0 : 
                                  week.attendance === 'pending' ? null : 
                                  week.attendance === 'late' ? week.concentrationScore * 0.7 :
                                  week.concentrationScore,
                    headPosition: week.attendance === 'absent' ? 0 : 
                                 week.attendance === 'pending' ? null : 
                                 week.attendance === 'late' ? week.headPositionScore * 0.7 :
                                 week.headPositionScore,
                    blink: week.attendance === 'absent' ? 0 : 
                           week.attendance === 'pending' ? null : 
                           week.attendance === 'late' ? week.blinkScore * 0.7 :
                           week.blinkScore,
                    total: week.attendance === 'absent' ? 0 : 
                           week.attendance === 'pending' ? null : 
                           week.attendance === 'late' ? week.total * 0.7 :
                           week.total
                };

                row.innerHTML = `
                    <td>${week.week}주차</td>
                    <td>${formatDate(week.date)}</td>
                    <td>
                        <div class="score-fraction">
                            <span class="score-value">${scores.headPosition !== null ? scores.headPosition.toFixed(1) : '-'}</span>
                            <span class="score-divider">/</span>
                            <span class="score-total">50</span>
                        </div>
                    </td>
                    <td>
                        <div class="score-fraction">
                            <span class="score-value">${scores.concentration !== null ? scores.concentration.toFixed(1) : '-'}</span>
                            <span class="score-divider">/</span>
                            <span class="score-total">30</span>
                        </div>
                    </td>
                    <td>
                        <div class="score-fraction">
                            <span class="score-value">${scores.blink !== null ? scores.blink.toFixed(1) : '-'}</span>
                            <span class="score-divider">/</span>
                            <span class="score-total">20</span>
                        </div>
                    </td>
                    <td class="total-score">${scores.total !== null ? scores.total.toFixed(1) : '-'}</td>
                    <td>
                        <span class="attendance-badge ${attendanceStatus.class}">
                            ${attendanceStatus.text}
                        </span>
                        ${week.attendance === 'late' ? '<span class="late-penalty"></span>' : ''}
                    </td>
                `;
                modalTableBody.appendChild(row);

                // 그래프 데이터 추가 - 모든 주차 표시
                weeks.push(`${week.week}주차`);
                if (week.attendance === 'pending') {  // 미출결인 경우 null 추가
                    concentrationScores.push(null);
                    headPositionScores.push(null);
                    blinkScores.push(null);
                    totalScores.push(null);
                } else {  // 출석/지각/결석인 경우 점수 추가
                    concentrationScores.push(scores.concentration);
                    headPositionScores.push(scores.headPosition);
                    blinkScores.push(scores.blink);
                    totalScores.push(scores.total);
                }
            });
            
            // 그래프 생성
            const ctx = document.getElementById('weeklyGradesChart').getContext('2d');
            
            // 기존 차트가 있다면 제거
            if (window.weeklyGradesChart instanceof Chart) {
                window.weeklyGradesChart.destroy();
            }

            // 새로운 차트 생성
            window.weeklyGradesChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: weeks,
                    datasets: [
                        {
                            label: '졸음',
                            data: headPositionScores,
                            borderColor: '#2196F3',
                            backgroundColor: 'rgba(33, 150, 243, 0.1)',
                            tension: 0.4,
                            fill: true
                        },
                        {
                            label: '고개 돌림',
                            data: concentrationScores,
                            borderColor: '#FFC107',
                            backgroundColor: 'rgba(255, 193, 7, 0.1)',
                            tension: 0.4,
                            fill: true
                        },
                        {
                            label: '눈 깜빡임',
                            data: blinkScores,
                            borderColor: '#4CAF50',
                            backgroundColor: 'rgba(76, 175, 80, 0.1)',
                            tension: 0.4,
                            fill: true
                        },
                        {
                            label: '총점',
                            data: totalScores,
                            borderColor: '#E91E63',
                            backgroundColor: 'rgba(233, 30, 99, 0.1)',
                            tension: 0.4,
                            fill: true
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: {
                                color: document.body.classList.contains('light-mode') ? '#000' : '#fff',
                                padding: 20,
                                font: {
                                    size: 12
                                }
                            }
                        },
                        title: {
                            display: true,
                            text: '주차별 성적 추이',
                            color: document.body.classList.contains('light-mode') ? '#000' : '#fff',
                            font: {
                                size: 16,
                                weight: 'bold'
                            },
                            padding: {
                                top: 10,
                                bottom: 30
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100,
                            grid: {
                                color: document.body.classList.contains('light-mode') ? 
                                    'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)'
                            },
                            ticks: {
                                color: document.body.classList.contains('light-mode') ? '#000' : '#fff',
                                font: {
                                    size: 12
                                }
                            }
                        },
                        x: {
                            grid: {
                                color: document.body.classList.contains('light-mode') ? 
                                    'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)'
                            },
                            ticks: {
                                color: document.body.classList.contains('light-mode') ? '#000' : '#fff',
                                font: {
                                    size: 12
                                }
                            }
                        }
                    },
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    },
                    elements: {
                        point: {
                            radius: 4,
                            hoverRadius: 6
                        }
                    },
                    spanGaps: true
                }
            });
            
            // 모달 제목 업데이트
            const modalTitle = document.querySelector('#weeklyGradesModal .card-header h3');
            modalTitle.textContent = `< 주차별 성적 > ${courseName}`;
            
            // 모달 표시
            const modal = document.getElementById('weeklyGradesModal');
            modal.style.display = 'block';
            
            // 모달 닫기 버튼 이벤트
            const closeBtn = modal.querySelector('.close');
            closeBtn.onclick = function() {
                modal.style.display = 'none';
            }
            
            // 모달 외부 클릭 시 닫기
            window.onclick = function(event) {
                if (event.target == modal) {
                    modal.style.display = 'none';
                }
            }
        } catch (error) {
            console.error('성적 데이터 조회 오류:', error);
            alert('성적 데이터를 불러오는데 실패했습니다.');
        }
    }

    // 평균 계산 헬퍼 함수를 수정
    function average(numbers) {
        // null, undefined, 그리고 미출결 상태의 값들을 제외
        const validNumbers = numbers.filter(n => n !== null && n !== undefined);
        return validNumbers.length > 0 ? validNumbers.reduce((a, b) => a + b, 0) / validNumbers.length : 0;
    }

    // 초기 데이터 로드
    console.log('fetchEnrolledCourses 호출 전');
    fetchEnrolledCourses();
    displayAverageGrades(); // 초기 평균 점수 표시
    console.log('fetchEnrolledCourses 호출 후');

    // 페이지 로드 시 총 평균 점수 표시
    displayAverageGrades();

    // 과목별 성적 데이터를 가져오는 함수 수정
    async function fetchCourseGrades() {
        try {
            // 1. 수강 중인 과목 목록 가져오기
            const response = await fetch(`${SERVER_URL}/api/student/grades/courses/${currentUser.id}`);
            if (!response.ok) {
                throw new Error('과목 목록을 불러오는데 실패했습니다.');
            }
            const data = await response.json();
            const courses = data.courses || data;

            // 2. 각 과목별 성적 데이터 계산
            const gradesData = await Promise.all(courses.map(async (course) => {
                const courseId = course.c_id;
                
                // 3. 태도 점수와 출석 점수를 서버에서 가져오기
                const scoresResponse = await fetch(`${SERVER_URL}/api/student/grades/course_scores/${currentUser.id}/${courseId}`);
                if (!scoresResponse.ok) {
                    throw new Error(`${course.c_name} 과목의 점수를 불러오는데 실패했습니다.`);
                }
                const scores = await scoresResponse.json();
                
                // 4. 정기시험 점수 (60-100점 사이 랜덤)
                const regularExam = Math.floor(Math.random() * (100 - 60 + 1)) + 60;
                
                // 5. 과제 점수 (60-100점 사이 랜덤)
                const assignment = Math.floor(Math.random() * (100 - 60 + 1)) + 60;
                
                // 6. 총점 계산 (가중치 적용)
                const total_score = (
                    regularExam * 0.6 +                // 정기시험 60%
                    assignment * 0.2 +                 // 과제 20%
                    scores.attitude_score * 0.1 +      // 태도 10%
                    scores.attendance_score * 0.1      // 출석 10%
                );

                return {
                    course_name: course.c_name,
                    professor_name: course.professor_name,
                    regular_exam: Math.round(regularExam * 10) / 10,
                    assignment: Math.round(assignment * 10) / 10,
                    attitude: Math.round(scores.attitude_score * 10) / 10,
                    attendance: Math.round(scores.attendance_score * 10) / 10,
                    total_score: Math.round(total_score * 10) / 10
                };
            }));

            return gradesData;
        } catch (error) {
            console.error('성적 데이터 조회 오류:', error);
            return null;
        }
    }

    // 과목별 성적 테이블 업데이트 함수 수정
    async function displayCourseGrades() {
        const tableBody = document.getElementById('courseGradeTableBody');
        if (!tableBody) return;

        tableBody.innerHTML = `
            <tr>
                <td colspan="7" class="loading-message">성적 데이터를 불러오는 중...</td>
            </tr>
        `;

        try {
            const grades = await fetchCourseGrades();
            
            if (!grades || grades.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="7" class="no-data-message">성적 데이터가 없습니다.</td>
                    </tr>
                `;
                return;
            }

            tableBody.innerHTML = '';

            grades.forEach(course => {
                const grade = calculateGrade(course.total_score);
                
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${course.course_name}</td>
                    <td><span class="score-value">${course.regular_exam}</span> <span class="score-total">/ 100</span></td>
                    <td><span class="score-value">${course.assignment}</span> <span class="score-total">/ 100</span></td>
                    <td><span class="score-value">${course.attitude}</span> <span class="score-total">/ 100</span></td>
                    <td><span class="score-value">${course.attendance}</span> <span class="score-total">/ 100</span></td>
                    <td><span class="score-value">${course.total_score}</span> <span class="score-total">/ 100</span></td>
                    <td>${grade}</td>
                `;
                
                tableBody.appendChild(row);
            });

        } catch (error) {
            console.error('성적 표시 오류:', error);
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="error-message">성적 데이터를 불러오는데 실패했습니다.</td>
                </tr>
            `;
        }
    }

    // grades 페이지가 활성화될 때 과목별 성적도 표시
    const gradesLink = document.querySelector('li[data-page="grades"]');
    if (gradesLink) {
        gradesLink.addEventListener('click', async () => {
            // 페이지 전환 시 모든 데이터 새로고침
            await Promise.all([
                displayAverageGrades(),
                displayCourseGrades()
            ]);
        });
    }

    // 초기 로드 시 grades 페이지가 활성 상태라면 과목별 성적 표시
    if (document.querySelector('#grades-page.active')) {
        // 초기 로드 시 모든 데이터 표시
        Promise.all([
            displayAverageGrades(),
            displayCourseGrades()
        ]);
    }

    // 출석 통계를 업데이트하는 함수 수정
    async function updateAttendanceStats() {
        try {
            // 현재 선택된 과목 ID 가져오기
            const courseFilter = document.querySelector('.grade-filters #courseFilter');
            const selectedCourseId = courseFilter ? courseFilter.value : null;

            if (!selectedCourseId) {
                // 과목이 선택되지 않은 경우 기본값 표시
                const stats = {
                    present: 0,
                    late: 0,
                    absent: 0
                };
                Object.entries(stats).forEach(([type, count]) => {
                    const element = document.querySelector(`.stat-item .value[data-type="${type}"]`);
                    if (element) {
                        element.textContent = `${count}회`;
                    }
                });
                return;
            }

            // 선택된 과목의 출석 정보 가져오기
            const response = await fetch(`${SERVER_URL}/api/student/attendance/summary/${currentUser.id}/${selectedCourseId}`);
            if (!response.ok) {
                throw new Error('출석 데이터를 불러오는데 실패했습니다.');
            }
            const data = await response.json();

            // UI 업데이트
            const updateElement = (type, count) => {
                const element = document.querySelector(`.stat-item .value[data-type="${type}"]`);
                if (element) {
                    element.textContent = `${count}회`;
                }
            };

            updateElement('present', data.summary.present_count);
            updateElement('late', data.summary.late_count);
            updateElement('absent', data.summary.absent_count);

        } catch (error) {
            console.error('출석 통계 업데이트 오류:', error);
            console.error('에러 상세:', error.message);
        }
    }

    // 출석 페이지 활성화 시 통계 업데이트
    const attendanceLink = document.querySelector('li[data-page="attendance"]');
    if (attendanceLink) {
        attendanceLink.addEventListener('click', () => {
            updateAttendanceStats();
        });
    }

    // 페이지 로드 시 출석 통계 업데이트
    updateAttendanceStats();
});
