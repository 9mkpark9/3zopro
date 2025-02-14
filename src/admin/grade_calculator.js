class GradeCalculator {
    constructor() {
        this.SERVER_URL = `http://${window.config.serverUrl}:${window.config.serverPort}`;
        this.currentUser = JSON.parse(localStorage.getItem('currentUser'));
        this.initializeCalculator();
    }

    async initializeCalculator() {
        try {
            // 현재 교수의 강의를 듣는 학생들의 정보를 가져옴
            const students = await this.getEnrolledStudents();
            // 임의의 시험 및 과제 점수 생성
            const gradesWithScores = this.generateRandomScores(students);
            // 출석 점수(st_concentration) 가져오기
            const attendanceScores = await this.getAttendanceScores();
            // 최종 성적 계산
            const finalGrades = this.calculateFinalGrades(gradesWithScores, attendanceScores);
            
            // 테이블과 차트 업데이트
            this.updateGradeTable(finalGrades);
            this.updateGradeDistribution(finalGrades);
        } catch (error) {
            console.error('성적 계산 초기화 실패:', error);
        }
    }

    // 강의를 듣는 학생 목록 가져오기
    async getEnrolledStudents() {
        const response = await fetch(`${this.SERVER_URL}/api/enrolled-students/${this.currentUser.id}`);
        const data = await response.json();
        return data.students || [];
    }

    // 임의의 시험 및 과제 점수 생성
    generateRandomScores(students) {
        return students.map(student => ({
            ...student,
            midterm_score: Math.floor(Math.random() * 41) + 60, // 60-100
            final_score: Math.floor(Math.random() * 41) + 60,   // 60-100
            assignment_score: Math.floor(Math.random() * 41) + 60 // 60-100
        }));
    }

    // st_concentration 테이블에서 출석 점수 가져오기
    async getAttendanceScores() {
        const response = await fetch(`${this.SERVER_URL}/api/attendance-scores`);
        const data = await response.json();
        return data.scores || {};
    }

    // 최종 성적 계산
    calculateFinalGrades(students, attendanceScores) {
        return students.map(student => {
            const attendanceScore = attendanceScores[student.s_id] || 0;
            const totalScore = (
                student.midterm_score * 0.3 +    // 중간고사 30%
                student.final_score * 0.3 +      // 기말고사 30%
                student.assignment_score * 0.2 +  // 과제 20%
                attendanceScore * 0.2            // 출석 20%
            );

            return {
                ...student,
                attendance_score: attendanceScore,
                total_score: totalScore,
                grade: this.calculateGrade(totalScore)
            };
        });
    }

    // 점수를 학점으로 변환
    calculateGrade(score) {
        if (score >= 95) return 'A+';
        if (score >= 90) return 'A0';
        if (score >= 85) return 'B+';
        if (score >= 80) return 'B0';
        if (score >= 75) return 'C+';
        if (score >= 70) return 'C0';
        if (score >= 65) return 'D+';
        if (score >= 60) return 'D0';
        return 'F';
    }

    // 성적 테이블 업데이트
    updateGradeTable(grades) {
        const tbody = document.querySelector('.grades-table tbody');
        if (!tbody) return;

        tbody.innerHTML = grades.map(student => `
            <tr>
                <td>${student.s_id}</td>
                <td>${student.name}</td>
                <td>${student.midterm_score}</td>
                <td>${student.final_score}</td>
                <td>${student.assignment_score}</td>
                <td>${student.attendance_score.toFixed(1)}</td>
                <td>${student.total_score.toFixed(1)}</td>
                <td>${student.grade}</td>
            </tr>
        `).join('');
    }

    // 성적 분포 차트 업데이트
    updateGradeDistribution(grades) {
        const distribution = {
            'A+': 0, 'A0': 0, 'B+': 0, 'B0': 0,
            'C+': 0, 'C0': 0, 'D+': 0, 'D0': 0, 'F': 0
        };

        grades.forEach(student => {
            distribution[student.grade]++;
        });

        const ctx = document.getElementById('gradeDistributionChart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(distribution),
                datasets: [{
                    label: '학생 수',
                    data: Object.values(distribution),
                    backgroundColor: 'rgba(225, 78, 202, 0.6)',
                    borderColor: 'rgba(225, 78, 202, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
    }
}

// DOM이 로드되면 GradeCalculator 인스턴스 생성
document.addEventListener('DOMContentLoaded', () => {
    new GradeCalculator();
});