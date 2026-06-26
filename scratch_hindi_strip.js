const fs = require('fs');
const pdfParse = require('pdf-parse');

async function run() {
  const buffer = fs.readFileSync('scratch.pdf');
  const data = await pdfParse(buffer);
  let text = data.text;
  
  // Remove Devanagari block characters
  text = text.replace(/[\u0900-\u097F]+/g, '');
  
  // Remove extra spaces that might be left over from removing words
  text = text.replace(/ {2,}/g, ' ');
  
  const lines = text.split('\n');
  const englishLines = [];
  
  for(let line of lines) {
     line = line.trim();
     if(line) englishLines.push(line);
  }
  
  console.log("--- STRIPPED TEXT PREVIEW (first 1500 chars) ---");
  console.log(englishLines.join('\n').substring(0, 1500));
}
run().catch(console.error);
