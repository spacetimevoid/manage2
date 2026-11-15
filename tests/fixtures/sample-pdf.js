            export function buildSamplePdfBlobUrl(file) {
                if (file.blobUrl) {
                    if (!file.pageCount) file.pageCount = 3;
                    return file.blobUrl;
                }

                const sanitize = (str) => String(str)
                    .replace(/[^\x20-\x7E]/g, '-')
                    .replace(/\\/g, '\\\\')
                    .replace(/\(/g, '\\(')
                    .replace(/\)/g, '\\)');

                const title = sanitize(file.name);
                const pathLine = sanitize(`Sources / ${file.subject} / ${file.name}`);
                const topicLine = sanitize(`Topic: ${file.topic}`);
                const dueLine = sanitize(`Due Date: ${file.dueDate}`);
                const statusLine = sanitize(`Status: ${file.done ? 'Completed' : 'Pending'}`);

                const page1Stream = [
                    'BT',
                    '/F2 11 Tf 56 770 Td (APPLE ARCHIVE  -  PAGE 1 OF 3) Tj',
                    '/F1 18 Tf 0 -30 Td (' + title + ') Tj',
                    'ET',
                    '0.82 0.82 0.84 RG 1 w 56 726 m 556 726 l S',
                    'BT',
                    '/F2 11 Tf 56 704 Td (Path: ' + pathLine + ') Tj',
                    '0 -20 Td (' + topicLine + ') Tj',
                    '0 -20 Td (' + dueLine + ') Tj',
                    '0 -20 Td (' + statusLine + ') Tj',
                    '/F1 12 Tf 0 -38 Td (1. Overview & Key Concepts) Tj',
                    '/F2 10.5 Tf 0 -20 Td (This document is rendered inside the built-in browser PDF viewer.) Tj',
                    '0 -17 Td (Use the Pages and Zoom controls in the dark toolbar above to navigate.) Tj',
                    '/F1 12 Tf 0 -34 Td (2. Study Notes & Problem Outline) Tj',
                    '/F2 10.5 Tf 0 -20 Td (- Review core definitions, theorems, and worked examples for ' + sanitize(file.topic) + '.) Tj',
                    '0 -17 Td (- Complete practice exercises before ' + dueLine.replace('Due Date: ', '') + '.) Tj',
                    '0 -17 Td (- Toggle status in the top toolbar once finished.) Tj',
                    'ET'
                ].join('\n');

                const page2Stream = [
                    'BT',
                    '/F2 11 Tf 56 770 Td (APPLE ARCHIVE  -  PAGE 2 OF 3) Tj',
                    '/F1 16 Tf 0 -28 Td (Core Formulas & Theoretical Framework) Tj',
                    'ET',
                    '0.82 0.82 0.84 RG 1 w 56 730 m 556 730 l S',
                    'BT',
                    '/F2 10.5 Tf 56 706 Td (Subject Area: ' + sanitize(file.subject) + '  |  Topic: ' + sanitize(file.topic) + ') Tj',
                    '0 -26 Td (- Fundamental definitions, axioms, and boundary conditions.) Tj',
                    '0 -18 Td (- Step-by-step derivation methodology and edge-case verification.) Tj',
                    '0 -18 Td (- Cross-references to lecture handouts and problem sets.) Tj',
                    'ET'
                ].join('\n');

                const page3Stream = [
                    'BT',
                    '/F2 11 Tf 56 770 Td (APPLE ARCHIVE  -  PAGE 3 OF 3) Tj',
                    '/F1 16 Tf 0 -28 Td (Practice Exercises & Self-Assessment) Tj',
                    'ET',
                    '0.82 0.82 0.84 RG 1 w 56 730 m 556 730 l S',
                    'BT',
                    '/F2 10.5 Tf 56 706 Td (Checklist before ' + dueLine.replace('Due Date: ', '') + ':) Tj',
                    '0 -24 Td (1. Solve standard drills and verify intermediate steps.) Tj',
                    '0 -18 Td (2. Attempt synthesis problems under timed conditions.) Tj',
                    '0 -18 Td (3. Record summary takeaways in the floating Notes window.) Tj',
                    'ET'
                ].join('\n');

                const objects = [
                    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
                    '2 0 obj\n<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>\nendobj',
                    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 6 0 R /Resources << /Font << /F1 9 0 R /F2 10 0 R >> >> >>\nendobj',
                    '4 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 7 0 R /Resources << /Font << /F1 9 0 R /F2 10 0 R >> >> >>\nendobj',
                    '5 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 8 0 R /Resources << /Font << /F1 9 0 R /F2 10 0 R >> >> >>\nendobj',
                    `6 0 obj\n<< /Length ${page1Stream.length} >>\nstream\n${page1Stream}\nendstream\nendobj`,
                    `7 0 obj\n<< /Length ${page2Stream.length} >>\nstream\n${page2Stream}\nendstream\nendobj`,
                    `8 0 obj\n<< /Length ${page3Stream.length} >>\nstream\n${page3Stream}\nendstream\nendobj`,
                    '9 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj',
                    '10 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj'
                ];

                let pdf = '%PDF-1.4\n';
                const offsets = [0];
                objects.forEach((obj) => {
                    offsets.push(pdf.length);
                    pdf += obj + '\n';
                });

                const xrefStart = pdf.length;
                pdf += `xref\n0 ${objects.length + 1}\n`;
                pdf += '0000000000 65535 f \n';
                for (let i = 1; i < offsets.length; i++) {
                    pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
                }
                pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

                const blob = new Blob([pdf], { type: 'application/pdf' });
                file.blobUrl = URL.createObjectURL(blob);
                file.pageCount = 3;
                return file.blobUrl;
            }

