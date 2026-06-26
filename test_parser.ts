import * as fs from 'fs';
import { parsePdfAdvanced } from './lib/advanced-pdf-parser';

async function run() {
  const filePath = 'C:/Users/rahul/OneDrive/Documents/Question_Report_130.pdf';
  const buffer = fs.readFileSync(filePath);
  console.log("Parsing...");
  try {
    const questions = await parsePdfAdvanced(buffer);
    console.log(`Found ${questions.length} questions.`);
    if (questions.length === 0) {
        console.log("Uh oh, 0 questions.");
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
