const fs = require('fs');
const { customParsePDF } = require('./lib/custom-pdf-parser.ts');
require('ts-node').register(); // To run TS file directly

async function run() {
  const buffer = fs.readFileSync('scratch.pdf');
  const questions = await customParsePDF(buffer);
  
  console.log("Total Valid Questions Extracted:", questions.length);
  if (questions.length > 0) {
    console.log("First question preview:");
    console.log(JSON.stringify(questions[0], null, 2));
  }
}
run().catch(console.error);
