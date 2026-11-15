            const SUBJECTS = [
                "math", "physics", "chemistry", "ielts",
                "computer-science", "algorithms", "data-structures", "linear-algebra",
                "calculus", "differential-equations", "probability", "statistics",
                "discrete-math", "number-theory", "geometry", "mechanics",
                "electromagnetism", "thermodynamics", "quantum-physics", "optics",
                "organic-chemistry", "inorganic-chemistry", "physical-chemistry", "analytical-chemistry",
                "biochemistry", "mechatronics", "control-systems", "robotics",
                "embedded-systems", "microcontrollers", "circuit-analysis", "digital-logic",
                "signal-processing", "materials-science", "fluid-mechanics", "machine-learning",
                "deep-learning", "natural-language", "computer-vision", "operating-systems",
                "databases", "computer-networks", "web-development", "software-engineering",
                "economics", "microeconomics", "macroeconomics", "philosophy",
                "academic-writing", "reading-comprehension", "speaking-practice", "logic"
            ];

            // Primary sample PDF files (includes 14 files in 'math' and 32 total across key subjects)
            const PRIMARY_FILES = [
                { name: "Calculus_12_Chapter_1_Limits.pdf", topic: "Limits & Continuity", subject: "math", dueDate: "18/11/2026", done: true },
                { name: "Calculus_12_Chapter_2_Derivatives.pdf", topic: "Differentiation", subject: "math", dueDate: "19/11/2026", done: true },
                { name: "Combinatorics_and_Probability.pdf", topic: "Combinatorics", subject: "math", dueDate: "20/11/2026", done: false },
                { name: "Analytic_Geometry_3D_Vectors.pdf", topic: "3D Vectors", subject: "math", dueDate: "21/11/2026", done: true },
                { name: "Complex_Numbers_Problem_Set.pdf", topic: "Complex Plane", subject: "math", dueDate: "23/11/2026", done: false },
                { name: "Definite_Integrals_Applications.pdf", topic: "Integration", subject: "math", dueDate: "24/11/2026", done: true },
                { name: "Logarithmic_and_Exponential_Functions.pdf", topic: "Transcendental", subject: "math", dueDate: "26/11/2026", done: false },
                { name: "Sequences_and_Series_Convergence.pdf", topic: "Infinite Series", subject: "math", dueDate: "28/11/2026", done: true },
                { name: "Euclidean_Solid_Geometry_Volumes.pdf", topic: "Solid Geometry", subject: "math", dueDate: "29/11/2026", done: false },
                { name: "Trigonometric_Identities_Workshop.pdf", topic: "Trigonometry", subject: "math", dueDate: "01/12/2026", done: true },
                { name: "Matrices_and_Determinants_Review.pdf", topic: "Matrix Theory", subject: "math", dueDate: "03/12/2026", done: false },
                { name: "Differential_Calculus_Optimization.pdf", topic: "Optimization", subject: "math", dueDate: "05/12/2026", done: true },
                { name: "Multivariable_Partial_Derivatives.pdf", topic: "Multivariable", subject: "math", dueDate: "07/12/2026", done: false },
                { name: "Vector_Spaces_and_Basis_Proofs.pdf", topic: "Vector Spaces", subject: "math", dueDate: "09/12/2026", done: true },
                { name: "Mechanical_Oscillations_Waves.pdf", topic: "Harmonic Motion", subject: "physics", dueDate: "22/11/2026", done: true },
                { name: "AC_Circuits_Advanced.pdf", topic: "AC Resonance", subject: "physics", dueDate: "25/11/2026", done: false },
                { name: "Electromagnetic_Induction_Notes.pdf", topic: "Faraday's Law", subject: "physics", dueDate: "02/12/2026", done: true },
                { name: "Quantum_Mechanics_Wavefunctions.pdf", topic: "Wave Mechanics", subject: "physics", dueDate: "11/12/2026", done: false },
                { name: "Organic_Chemistry_Esters_Lipids.pdf", topic: "Esters & Lipids", subject: "chemistry", dueDate: "27/11/2026", done: true },
                { name: "Inorganic_Chemistry_Electrolysis.pdf", topic: "Electrochemistry", subject: "chemistry", dueDate: "04/12/2026", done: false },
                { name: "Chemical_Equilibrium_and_Kinetics.pdf", topic: "Reaction Kinetics", subject: "chemistry", dueDate: "13/12/2026", done: true },
                { name: "IELTS_Writing_Task2_Templates.pdf", topic: "Argumentative Essay", subject: "ielts", dueDate: "30/11/2026", done: false },
                { name: "IELTS_Reading_Academic_Practice.pdf", topic: "Matching Headings", subject: "ielts", dueDate: "06/12/2026", done: true },
                { name: "IELTS_Listening_Section4_Notes.pdf", topic: "Academic Lecture", subject: "ielts", dueDate: "15/12/2026", done: false },
                { name: "Linear_Algebra_Eigenvalues.pdf", topic: "Spectral Theory", subject: "linear-algebra", dueDate: "08/12/2026", done: true },
                { name: "Singular_Value_Decomposition.pdf", topic: "Matrix Factorization", subject: "linear-algebra", dueDate: "17/12/2026", done: false },
                { name: "Algorithms_Dynamic_Programming.pdf", topic: "Memoization & DP", subject: "algorithms", dueDate: "10/12/2026", done: false },
                { name: "Graph_Shortest_Paths_Dijkstra.pdf", topic: "Graph Traversal", subject: "algorithms", dueDate: "19/12/2026", done: true },
                { name: "Embedded_ESP32_Drivers.pdf", topic: "Peripheral I/O", subject: "embedded-systems", dueDate: "12/12/2026", done: true },
                { name: "Control_Systems_PID_Tuning.pdf", topic: "Feedback Loops", subject: "control-systems", dueDate: "14/12/2026", done: false },
                { name: "Robotics_Inverse_Kinematics.pdf", topic: "Manipulator Arms", subject: "robotics", dueDate: "16/12/2026", done: true },
                { name: "Data_Structures_Segment_Trees.pdf", topic: "Range Queries", subject: "data-structures", dueDate: "18/12/2026", done: false }
            ];

            // Generate consistent sample English PDF files for all remaining subjects
            const ALL_FILES = [...PRIMARY_FILES];
            SUBJECTS.forEach((subj, idx) => {
                const existing = ALL_FILES.filter((f) => f.subject === subj);
                if (existing.length === 0) {
                    const titleWords = subj
                        .split('-')
                        .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
                    const slug = titleWords.join('_');
                    const topicLabel = titleWords.join(' ');
                    const day1 = String((idx % 25) + 1).padStart(2, '0');
                    const day2 = String(((idx + 4) % 25) + 1).padStart(2, '0');
                    const month = idx % 2 === 0 ? '11' : '12';

                    ALL_FILES.push(
                        { name: `${slug}_Lecture_Notes_01.pdf`, topic: `${topicLabel} Core`, subject: subj, dueDate: `${day1}/${month}/2026`, done: idx % 2 === 0 },
                        { name: `${slug}_Problem_Set_Solutions.pdf`, topic: `${topicLabel} Practice`, subject: subj, dueDate: `${day2}/${month}/2026`, done: idx % 3 === 0 }
                    );
                }
            });


export { SUBJECTS, ALL_FILES };
