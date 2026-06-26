const fs = require('fs');
const pdfParse = require('pdf-parse');

async function testParse() {
  const filePath = 'C:/Users/rahul/OneDrive/Documents/Question_Report_130.pdf';
  const buffer = fs.readFileSync(filePath);
  
  const data = await pdfParse(buffer);
  let text = data.text;
  
  // Clean up
  text = text.replace(/[\u0900-\u097F]+/g, ''); // Remove Hindi
  text = text.replace(/[\x00-\x09\x0B-\x0C\x0E-\x1F\x7F]+/g, ' '); // Clean control chars but keep newlines
  text = text.replace(/ {2,}/g, ' ');

  // Split by (A)
  // We want to find the pattern: Question Text followed by (A) ... (B) ... (C) ... (D) ...
  const questions = [];
  
  // Regex to match options block
  // It looks for (A) followed by anything until (B), then (C), then (D), then anything until the next question or end.
  // Actually, let's just split the entire text by `(A)`
  const chunks = text.split(/\(A\)/);
  
  for (let i = 1; i < chunks.length; i++) {
    const prevChunk = chunks[i-1];
    const currentChunk = chunks[i];
    
    // The question text is the last part of prevChunk
    // Usually after the previous (D) option, or at the start of the document.
    let qText = prevChunk;
    const lastD = qText.lastIndexOf('(D)');
    if (lastD !== -1) {
      qText = qText.substring(lastD + 3);
    }
    
    // Clean up question numbers at the start
    qText = qText.trim();
    qText = qText.replace(/^[\d\.\s]+/, ''); // Remove leading numbers like "1.1.", "2.2.", "3.", "4."
    
    // Now extract options from currentChunk
    // currentChunk has everything after (A) until the next (A)
    // It should contain (B), (C), (D)
    const bSplit = currentChunk.split(/\(B\)/);
    if (bSplit.length < 2) continue; // Not a valid question if no (B)
    
    const optionA = bSplit[0].trim();
    const cSplit = bSplit[1].split(/\(C\)/);
    if (cSplit.length < 2) continue;
    
    const optionB = cSplit[0].trim();
    const dSplit = cSplit[1].split(/\(D\)/);
    if (dSplit.length < 2) continue;
    
    const optionC = dSplit[0].trim();
    const optionD = dSplit[1].split('\n')[0].trim(); // Rough approximation for option D
    
    if (qText.length > 5) {
      questions.push({
        questionNo: questions.length + 1,
        questionText: qText,
        optionA,
        optionB,
        optionC,
        optionD,
        type: 'MCQ',
        correctAnswer: 'A'
      });
    }
  }

  console.log(`Extracted ${questions.length} questions!`);
  for (let i = 0; i < Math.min(3, questions.length); i++) {
    console.log(`\n--- Q${questions[i].questionNo} ---`);
    console.log(`Text: ${questions[i].questionText.substring(0, 100)}...`);
    console.log(`(A) ${questions[i].optionA}`);
    console.log(`(B) ${questions[i].optionB}`);
    console.log(`(C) ${questions[i].optionC}`);
    console.log(`(D) ${questions[i].optionD}`);
  }
}
testParse();
