// The ten example rows supplied in the approved Problems screenshot.
export const PROBLEM_FILES = [
  ['Limits_Indeterminate_Forms_Set', 'Limits & Continuity', '02/11/2026', 'easy'],
  ['Derivative_Parametric_Extrema', 'Differentiation', '03/11/2026', 'hard'],
  ['Counting_Principles_Olympiad', 'Combinatorics', '04/11/2026', 'med'],
  ['3D_Line_Plane_Intersection', '3D Vectors', '05/11/2026', 'easy'],
  ['Complex_Locus_Minimum_Modulus', 'Complex Plane', '06/11/2026', 'hard'],
  ['Area_Between_Curves_Drills', 'Integration', '07/11/2026', 'easy'],
  ['Exponential_Equation_Parameters', 'Transcendental', '08/11/2026', 'med'],
  ['Series_Convergence_Tests_Mix', 'Infinite Series', '09/11/2026', 'med'],
  ['Pyramid_Inscribed_Sphere_Problems', 'Solid Geometry', '10/11/2026', 'hard'],
  ['Trig_Equations_Interval_Roots', 'Trigonometry', '11/11/2026', 'easy'],
].map(([name, topic, addedDate, difficulty], i) => ({
  id: `problem-sample-${i}`, kind: 'problem', name: `${name}.pdf`, topic,
  subject: 'math', addedDate, difficulty, done: false, notes: '', sample: true, createdAt: 0,
}));
