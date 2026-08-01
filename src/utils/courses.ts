import { ref, set, onValue, remove } from 'firebase/database';
import { db } from '../firebase';
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

// Shared library lives in Firebase so every device sees the same courses.
// localStorage mirrors it as an offline / first-paint cache.
const COURSES_PATH = 'courses';
const CACHE_KEY = 'vegas-golf-courses';

function loadCache(): Course[] {
  try {
    const data = localStorage.getItem(CACHE_KEY);
    if (data) return JSON.parse(data);
  } catch {
    // Corrupt/unreadable storage — fall back to no custom courses.
  }
  return [];
}

function writeCache(courses: Course[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(courses));
  } catch {
    // Storage full or unavailable — the Firebase copy is still the source of truth.
  }
}

// RTDB may hand arrays back as objects; normalize holes to a real array.
function normalize(course: Course): Course {
  const holes = Array.isArray(course.holes)
    ? course.holes
    : (Object.values(course.holes ?? {}) as HoleSetup[]);
  return { ...course, holes };
}

// Geneva first, then any user-added courses (from the local cache — synchronous
// for initial render). Live updates arrive through subscribeCourses.
export function getAllCourses(): Course[] {
  return [GENEVA_COURSE, ...loadCache()];
}

// Subscribe to the shared course library. Emits [Geneva, ...custom] whenever the
// Firebase data changes, and keeps the local cache in step. Returns an unsub fn.
export function subscribeCourses(cb: (courses: Course[]) => void): () => void {
  const coursesRef = ref(db, COURSES_PATH);
  return onValue(
    coursesRef,
    (snap) => {
      const val = snap.val();
      const custom = (val ? Object.values(val) : []).map((c) => normalize(c as Course));
      writeCache(custom);
      cb([GENEVA_COURSE, ...custom]);
    },
    () => {
      // Firebase unreachable — serve whatever the cache has.
      cb(getAllCourses());
    },
  );
}

// Add or update a course in the shared library (optimistically updates cache).
export async function saveCustomCourse(course: Course): Promise<void> {
  const next = loadCache().filter((c) => c.id !== course.id);
  next.push(course);
  writeCache(next);
  await set(ref(db, `${COURSES_PATH}/${course.id}`), course);
}

export async function deleteCustomCourse(id: string): Promise<void> {
  writeCache(loadCache().filter((c) => c.id !== id));
  await remove(ref(db, `${COURSES_PATH}/${id}`));
}

// Build a blank 18-hole layout for a brand-new course (par 4s, handicaps 1-18).
export function blankHoles(): HoleSetup[] {
  return Array.from({ length: 18 }, (_, i) => ({
    number: i + 1,
    par: 4,
    handicapRating: i + 1,
  }));
}
