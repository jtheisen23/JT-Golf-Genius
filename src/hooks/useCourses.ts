import { useEffect, useState } from 'react';
import { Course } from '../types';
import {
  getAllCourses,
  subscribeCourses,
  saveCustomCourse,
  deleteCustomCourse,
} from '../utils/courses';

// Live view of the shared course library (Geneva + Firebase-synced customs).
// Any device that adds/edits/removes a course updates every other device.
export function useCourses() {
  const [courses, setCourses] = useState<Course[]>(() => getAllCourses());

  useEffect(() => subscribeCourses(setCourses), []);

  return {
    courses,
    saveCourse: saveCustomCourse,
    deleteCourse: deleteCustomCourse,
  };
}
