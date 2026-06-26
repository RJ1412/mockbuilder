const fs = require('fs');
const pdfParse = require('pdf-parse');

async function run() {
  const buffer = fs.readFileSync('scratch.pdf');
  const data = await pdfParse(buffer);
  const text = data.text;
  
  const questions = [];
  
  // Simple heuristic: Split by "1. ", "2. ", etc. at the start of a line
  const lines = text.split('\n');
  let currentQuestion = null;
  
  // This is a naive regex. Real documents might have "1. " inside text.
  const questionStartRegex = /^(\d+)\.\s*/;
  const optionRegex = /\(A\).*?\(B\).*?\(C\).*?\(D\).*/s; // Very naive
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(questionStartRegex);
    if (match) {
      if (currentQuestion) questions.push(currentQuestion);
      currentQuestion = {
        qNo: match[1],
        text: line.substring(match[0].length) + '\n',
        optionsFound: false
      };
    } else if (currentQuestion) {
      currentQuestion.text += line + '\n';
      if (line.includes('(A)') && line.includes('(B)')) {
        currentQuestion.optionsFound = true;
      }
    }
  }
  if (currentQuestion) questions.push(currentQuestion);
  
  console.log("Total Questions Extracted:", questions.length);
  for(let i=0; i<Math.min(3, questions.length); i++) {
     console.log("-------------------");
     console.log("Q" + questions[i].qNo, "MCQ:", questions[i].optionsFound);
     console.log(questions[i].text.substring(0, 150));
  }
}
run().catch(console.error);
