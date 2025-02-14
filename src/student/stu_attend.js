document.addEventListener('DOMContentLoaded', () => {
    // 현재 로그인한 학생 정보 가져오기
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    const SERVER_URL = `http://${window.config.serverUrl}:${window.config.serverPort}`;
    
    console.log('현재 로그인한 사용자:', currentUser); // 로그인 정보 확인

    // 과목 정보를 저장할 객체
    let coursesMap = {};

    // 학생이 신청한 과목 목록을 가져오는 함수
    async function fetchEnrolledCourses() {
        try {
            const response = await fetch(`${SERVER_URL}/api/student/grades/courses/${currentUser.id}`);
            if (!response.ok) {
                throw new Error('과목 목록을 불러오는데 실패했습니다.');
            }
            const data = await response.json();
            const courses = data.courses || [];
            
            // 과목 정보를 맵으로 저장
            coursesMap = courses.reduce((map, course) => {
                map[course.c_id] = course;
                return map;
            }, {});

            console.log('처리할 과목 목록:', courses);
            
            // DOM이 완전히 로드된 후에 실행
            setTimeout(() => {
                updateCourseFilter(courses);
            }, 0);
        } catch (error) {
            console.error('과목 목록 조회 오류:', error);
            alert('과목 목록을 불러오는데 실패했습니다.');
        }
    }

    // 과목 선택 콤보박스 업데이트 함수
    function updateCourseFilter(courses) {
        // 더 구체적인 선택자 사용
        const courseFilter = document.querySelector('.attendance-detail-card .card-header .filter-controls #courseFilter');
        console.log('찾은 courseFilter 요소:', courseFilter);
        
        if (!courseFilter) {
            console.error('courseFilter 요소를 찾을 수 없습니다. DOM이 아직 로드되지 않았을 수 있습니다.');
            return;
        }

        // 기존 옵션 제거
        courseFilter.innerHTML = '<option value="">과목 선택</option>';

        // 신청한 과목들을 콤보박스에 추가
        courses.forEach(course => {
            console.log('과목 데이터:', course);
            const option = document.createElement('option');
            option.value = course.c_id;
            option.textContent = course.c_name;
            courseFilter.appendChild(option);
        });
        
        console.log('최종 콤보박스 내용:', courseFilter.innerHTML);
    }

    // 출석 기록 테이블 업데이트 함수
    async function updateAttendanceTable(courseId) {
        try {
            const response = await fetch(`${SERVER_URL}/api/student/attendance/summary/${currentUser.id}/${courseId}`);
            if (!response.ok) {
                throw new Error('출석 정보를 불러오는데 실패했습니다.');
            }
            
            const data = await response.json();
            const selectedCourse = coursesMap[courseId];  // 선택된 과목 정보

            const tableBody = document.querySelector('.attendance-table tbody');
            if (!tableBody) {
                console.error('테이블 본문을 찾을 수 없습니다.');
                return;
            }

            tableBody.innerHTML = '';

            // 출석 상태 카운트 초기화
            let presentCount = 0;
            let lateCount = 0;
            let absentCount = 0;
            let pendingCount = 0;

            data.details.forEach(record => {
                const row = document.createElement('tr');
                
                const formatTime = (timeStr) => timeStr ? timeStr : '-';

                const formatDate = (dateStr) => {
                    const date = new Date(dateStr);
                    return date.toLocaleDateString('ko-KR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    });
                };

                // 출석 상태에 따른 카운트 증가
                let displayStatus = record.status;
                let statusClass = '';

                if (record.status === 'present' || record.status === '출석') {
                    displayStatus = '출석';
                    statusClass = 'status-present';
                    presentCount++;
                }
                else if (record.status === 'late' || record.status === '지각') {
                    displayStatus = '지각';
                    statusClass = 'status-late';
                    lateCount++;
                }
                else if (record.status === 'absent' || record.status === '결석') {
                    displayStatus = '결석';
                    statusClass = 'status-absent';
                    absentCount++;
                }
                else if (record.status === 'pending' || record.status === '미출결') {
                    displayStatus = '미출결';
                    statusClass = 'status-pending';
                    pendingCount++;
                }

                row.innerHTML = `
                    <td>${record.week}주차</td>
                    <td>${formatDate(record.date)}</td>
                    <td>${selectedCourse ? selectedCourse.c_name : '-'}</td>
                    <td>${formatTime(record.in_time)}</td>
                    <td>${formatTime(record.out_time)}</td>
                    <td>${record.total_time || '-'}</td>
                    <td>
                        <span class="attendance-badge ${statusClass}">${displayStatus}</span>
                    </td>
                `;
                
                tableBody.appendChild(row);
            });

            // 출석 통계 업데이트
            updateAttendanceStats({
                present_count: presentCount,
                late_count: lateCount,
                absent_count: absentCount,
                pending_count: pendingCount
            });


        } catch (error) {
            console.error('출석 정보 조회 오류:', error);
            alert('출석 정보를 불러오는데 실패했습니다.');
        }
    }

    // 출석 통계 업데이트 함수
    function updateAttendanceStats(summary) {
        const statsContainer = document.querySelector('.attendance-stats');
        if (!statsContainer) return;

        // 각 통계 값 업데이트
        const stats = {
            'present': summary.present_count,
            'late': summary.late_count,
            'absent': summary.absent_count
        };

        Object.entries(stats).forEach(([status, count]) => {
            const valueElement = statsContainer.querySelector(`.stat-item .stat-icon.${status} + .stat-info .value`);
            if (valueElement) {
                valueElement.textContent = `${count}회`;
            }
        });
    }

    // 과목 필터 변경 이벤트 처리
    const courseFilter = document.querySelector('.attendance-detail-card .card-header .filter-controls #courseFilter');
    if (courseFilter) {
        courseFilter.addEventListener('change', (e) => {
            const selectedCourseId = e.target.value;
            if (selectedCourseId) {
                updateAttendanceTable(selectedCourseId);
            } else {
                // 과목이 선택되지 않았을 때 테이블 초기화
                const tableBody = document.querySelector('.attendance-table tbody');
                if (tableBody) {
                    tableBody.innerHTML = '';
                }
                // 출석 통계도 초기화
                updateAttendanceStats({
                    present_count: 0,
                    late_count: 0,
                    absent_count: 0,
                    pending_count: 0
                });
            }
        });
    }

    // 페이지 로드 시 과목 목록 가져오기
    fetchEnrolledCourses();
});
