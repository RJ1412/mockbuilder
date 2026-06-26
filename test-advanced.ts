import { parsePdfAdvanced } from './lib/advanced-pdf-parser';
import * as fs from 'fs';

async function runTest() {
  const filePath = 'C:/Users/rahul/OneDrive/Documents/Question_Report_130.pdf';
  console.log("Reading:", filePath);
  
  if (!fs.existsSync(filePath)) {
    console.error("File not found!");
    return;
  }
  
  const buffer = fs.readFileSync(filePath);
  const start = Date.now();
  
  try {
    console.log("Starting parse...");
    const questions = await parsePdfAdvanced(buffer);
    const time = Date.now() - start;
    
    console.log(`Parsed ${questions.length} questions in ${time}ms.`);
    
    // Dump output
    fs.writeFileSync('advanced-dump.json', JSON.stringify(questions, null, 2));
    console.log("Dumped to advanced-dump.json");
  } catch (err) {
    console.error("Parsing failed:", err);
  }
}

runTest();
