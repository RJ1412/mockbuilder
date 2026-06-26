const fs = require('fs');
const pdfParse = require('pdf-parse');

async function run() {
  const buffer = fs.readFileSync('scratch.pdf');
  const data = await pdfParse(buffer);
  let text = data.text;
  
  // 1. Remove Devanagari block characters
  text = text.replace(/[\u0900-\u097F]+/g, '');
  
  // 2. Remove extra spaces that might be left over
  text = text.replace(/ {2,}/g, ' ');
  
  const lines = text.split('\n');
  const questions = [];
  
  // We want to avoid matching "1.1." or "2.2." as question "1". But wait, the original text had "1." from english, then "1." from hindi right next to it, making it "1.1." in some cases. Or "1. 1."
  // Wait, looking at the previous output:
  // "1.1."
  // "2.2."
  // A question starts with \d+\.
  const questionStartRegex = /^(\d+)\.\s*(?:\d+\.\s*)?(.*)/;

  let currentQuestion = null;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;

    // Filter out lines that are just punctuation or single stray numbers/characters leftover from Hindi stripping
    // E.g., "-I : (" or ": 80)"
    if (line.match(/^[-:(),.\s]+$/)) continue; // just punctuation

    const match = line.match(questionStartRegex);
    if (match && !line.match(/^\d+\.\s*\d+\.\s*\d+\./)) { // avoid matching something like 1.1.1. randomly
      if (currentQuestion) {
        questions.push(finalizeQuestion(currentQuestion));
      }
      currentQuestion = {
        questionNo: parseInt(match[1]),
        questionText: match[2] + '\n',
        rawOptions: '',
        type: 'NUMERICAL'
      };
    } else if (currentQuestion) {
      if (line.includes('(A)') || line.includes('(B)') || line.includes('(C)') || line.includes('(D)')) {
        currentQuestion.rawOptions += line + ' ';
      } else {
        if (currentQuestion.rawOptions) {
          // If we already started collecting options, append to options
          currentQuestion.rawOptions += line + ' ';
        } else {
          currentQuestion.questionText += line + '\n';
        }
      }
    }
  }
  
  if (currentQuestion) {
    questions.push(finalizeQuestion(currentQuestion));
  }

  function finalizeQuestion(q) {
    const result = {
      questionNo: q.questionNo,
      questionText: q.questionText.trim(),
      type: 'NUMERICAL',
    };

    if (q.rawOptions) {
      result.type = 'MCQ';
      // Naive option extraction
      // Use match with global to find all instances, then just take the first one.
      // But standard regex without global will naturally take the first match!
      const aMatch = q.rawOptions.match(/\(A\)\s*(.*?)(?=\(B\)|\(C\)|\(D\)|$)/);
      const bMatch = q.rawOptions.match(/\(B\)\s*(.*?)(?=\(C\)|\(D\)|\(A\)|$)/);
      const cMatch = q.rawOptions.match(/\(C\)\s*(.*?)(?=\(D\)|\(A\)|\(B\)|$)/);
      const dMatch = q.rawOptions.match(/\(D\)\s*(.*?)(?=\(A\)|\(B\)|\(C\)|$)/);

      result.optionA = aMatch ? aMatch[1].trim() : 'Option A';
      result.optionB = bMatch ? bMatch[1].trim() : 'Option B';
      result.optionC = cMatch ? cMatch[1].trim() : 'Option C';
      result.optionD = dMatch ? dMatch[1].trim() : 'Option D';
    }

    return result;
  }
  
  console.log("Extracted Questions:", questions.length);
  console.log(JSON.stringify(questions.slice(0, 3), null, 2));
}

run().catch(console.error);
