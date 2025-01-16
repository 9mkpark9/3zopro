const mysql = require('mysql');
const dbConfig = require('../config/db');

const connection = mysql.createConnection(dbConfig);

// 수업 등록
const registerCourse = (courseData) => {
  const query = `
    INSERT INTO class 
    (c_name, m_id, d_id, schedule_dates, st_time, end_time) 
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  
  // schedule_dates를 JSON 문자열로 변환
  const scheduleDates = JSON.stringify(courseData.scheduleDates);
  
  return new Promise((resolve, reject) => {
    connection.query(
      query, 
      [courseData.courseName, courseData.professorId, courseData.departmentId, 
       scheduleDates, courseData.startTime, courseData.endTime],
      (error, results) => {
        if (error) reject(error);
        resolve(results);
      }
    );
  });
};

// 교수의 강의 목록 조회
const getProfessorCourses = (professorId) => {
  const query = `
    SELECT c.*, d.d_name as department_name 
    FROM class c
    JOIN department d ON c.d_id = d.d_id
    WHERE c.m_id = ?
  `;
  
  return new Promise((resolve, reject) => {
    connection.query(query, [professorId], (error, results) => {
      if (error) reject(error);
      resolve(results);
    });
  });
};

// 학생 성적 및 집중도 조회
const getStudentPerformance = (classId) => {
  const query = `
    SELECT m.m_id, m.m_name, sc.* 
    FROM members m
    JOIN st_concentration sc ON m.m_id = sc.m_id
    WHERE sc.c_id = ?
    ORDER BY sc.lecture_date DESC
  `;
  
  return new Promise((resolve, reject) => {
    connection.query(query, [classId], (error, results) => {
      if (error) reject(error);
      resolve(results);
    });
  });
};

module.exports = {
  registerCourse,
  getProfessorCourses,
  getStudentPerformance
}; 