import { Course, HoleSetup } from '../types';

// Built-in default course. Kept as the first option everywhere and cannot be
// deleted — it's the home course.
const GENEVA_PARS = [4, 4, 4, 4, 3, 3, 4, 4, 4, 4, 4, 4, 4, 3, 3, 4, 4, 4];
const GENEVA_HDCPS = [1, 3, 9, 13, 17, 15, 5, 7, 11, 8, 2, 10, 14, 16, 18, 4, 6, 12];

export const GENEVA_COURSE: Course = {
  id: 'geneva',
  name: 'Geneva Golf Club',
  slope: 132,
  courseRating: 70,
  holes: GENEVA_PARS.map((par, i) => ({
    number: i + 1,
    par,
    handicapRating: GENEVA_HDCPS[i],
  })),
};

const CUSTOM_COURSES_KEY = 'vegas-golf-courses';

export function loadCustomCourses(): Course[] {
  try {
    const data = localStorage.getItem(CUSTOM_COURSES_KEY);
    if (data) return JSON.parse(data);
  } catch {
    // Corrupt/unreadable storage — fall back to no custom courses.
  }
  return [];
}

function persist(courses: Course[]): void {
  localStorage.setItem(CUSTOM_COURSES_KEY, JSON.stringify(courses));
}

// Add or update a custom course, returning the full updated custom list.
export function saveCustomCourse(course: Course): Course[] {
  const courses = loadCustomCourses();
  const idx = courses.findIndex((c) => c.id === course.id);
  if (idx >= 0) courses[idx] = course;
  else courses.push(course);
  persist(courses);
  return courses;
}

export function deleteCustomCourse(id: string): Course[] {
  const courses = loadCustomCourses().filter((c) => c.id !== id);
  persist(courses);
  return courses;
}

// Geneva first, then any user-added courses.
export function getAllCourses(): Course[] {
  return [GENEVA_COURSE, ...loadCustomCourses()];
}

// Build a blank 18-hole layout for a brand-new course (par 4s, handicaps 1-18).
export function blankHoles(): HoleSetup[] {
  return Array.from({ length: 18 }, (_, i) => ({
    number: i + 1,
    par: 4,
    handicapRating: i + 1,
  }));
}
