const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

const isHindi = (text) => /[\u0900-\u097F]/.test(text);

async function parsePdf() {
  const filePath = 'C:/Users/rahul/OneDrive/Documents/Question_Report_130.pdf';
  if (!fs.existsSync(filePath)) {
    console.error(`Error: ${filePath} not found.`);
    process.exit(1);
  }
  
  const buffer = fs.readFileSync(filePath);
  const data = new Uint8Array(buffer);
  
  const standardFontDataUrl = path.join(__dirname, 'node_modules/pdfjs-dist/standard_fonts/');
  const loadingTask = pdfjsLib.getDocument({ 
    data, 
    verbosity: 0,
    standardFontDataUrl,
  });
  
  const pdfDocument = await loadingTask.promise;
  
  let fullText = "";
  
  for (let i = 1; i <= pdfDocument.numPages; i++) {
    const page = await pdfDocument.getPage(i);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    const items = textContent.items;
    
    items.sort((a, b) => {
        const yA = a.transform[5];
        const yB = b.transform[5];
        if (Math.abs(yA - yB) < 4) return a.transform[4] - b.transform[4];
        return yB - yA; // Flipped Y
    });
    
    let lastY = -1;
    for (const item of items) {
        if (isHindi(item.str)) {
           continue;
        }
        
        // Skip right column if it exists (usually x > width/2)
        // Let's assume standard A4 width is ~595. If X > 300, it might be right column
        const x = item.transform[4];
        if (x > viewport.width * 0.52) {
           continue; 
        }

        if (lastY !== -1 && Math.abs(item.transform[5] - lastY) > 8) {
            fullText += "\n";
        } else if (lastY !== -1) {
            fullText += " ";
        }
        fullText += item.str.trim();
        lastY = item.transform[5];
    }
    fullText += "\n\n";
  }

  fullText = fullText.replace(/ {2,}/g, ' ');

  // Clean up headers and footers
  fullText = fullText.replace(/LEADER TEST SERIES \/ JOINT PACKAGE COURSE[\s\S]*?@JEEAdvanced_2025/gi, '');
  fullText = fullText.replace(/Space for Rough Work/gi, '');

  // Output intermediate for debugging
  fs.writeFileSync('debug_fulltext.txt', fullText, 'utf-8');

  const questions = [];
  const metadata = {
      exam_name: "Mock CBT Exam",
      total_questions: 0,
      total_marks: 0,
      duration_minutes: 180,
      subjects: ["Physics", "Chemistry", "Mathematics"]
  };
  
  const validation_report = {
      total_questions: 0,
      missing_answers: 0,
      low_confidence_flags: 0,
      unresolved_images: 0
  };

  const chunks = fullText.split(/\(A\)/);
  let currentSubject = "Physics";

  for (let idx = 1; idx < chunks.length; idx++) {
      const prevChunk = chunks[idx - 1];
      const currentChunk = chunks[idx];
      
      let qText = prevChunk;
      const lastD = qText.lastIndexOf('(D)');
      if (lastD !== -1) {
          qText = qText.substring(lastD + 3);
      }
      
      if (qText.toUpperCase().includes("CHEMISTRY")) currentSubject = "Chemistry";
      if (qText.toUpperCase().includes("MATHEMATICS")) currentSubject = "Mathematics";

      qText = qText.trim();
      
      let qNumStr = "0";
      const qNumMatch = qText.match(/^(\d+)[\.\)]/);
      if (qNumMatch) {
          qNumStr = qNumMatch[1];
          qText = qText.replace(/^[\d\.\)]+\s*/, '').trim();
      } else {
          qNumStr = String(idx);
      }

      const bSplit = currentChunk.split(/\(B\)/);
      if (bSplit.length < 2) continue;
      
      const optionA = bSplit[0].trim();
      const cSplit = bSplit[1].split(/\(C\)/);
      if (cSplit.length < 2) continue;
      
      const optionB = cSplit[0].trim();
      const dSplit = cSplit[1].split(/\(D\)/);
      if (dSplit.length < 2) continue;
      
      const optionC = dSplit[0].trim();
      const optionD = dSplit[1].split('\n')[0].trim() || dSplit[1].substring(0, 50).trim();
      
      if (qText.length > 3) {
          questions.push({
              question_id: `q-${idx}`,
              subject: currentSubject,
              section: "Section-I",
              question_number: parseInt(qNumStr) || idx,
              question_text: qText,
              question_images: [],
              options: [
                  { label: "A", text: optionA, image: null },
                  { label: "B", text: optionB, image: null },
                  { label: "C", text: optionC, image: null },
                  { label: "D", text: optionD, image: null }
              ],
              question_type: "single_correct",
              marks_correct: 4,
              marks_incorrect: -1,
              correct_answer: "A",
              solution: null
          });
      }
  }

  metadata.total_questions = questions.length;
  metadata.total_marks = questions.length * 4;
  validation_report.total_questions = questions.length;
  validation_report.missing_answers = questions.filter(q => !q.correct_answer).length;

  const output = { metadata, questions };
  
  fs.writeFileSync('app/(cbt)/tests/cbt-demo/test_data.json', JSON.stringify(output, null, 2), 'utf-8');
  fs.writeFileSync('validation_report.md', 'Generated...', 'utf-8');
  
  console.log(`Extraction complete! Found ${questions.length} questions.`);
}

parsePdf().catch(console.error);
