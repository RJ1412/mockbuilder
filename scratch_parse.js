const fs = require('fs');
const pdfParse = require('pdf-parse');

async function run() {
  const buffer = fs.readFileSync('scratch.pdf');
  const data = await pdfParse(buffer);
  console.log("NUM PAGES:", data.numpages);
  console.log("TEXT EXTRACTED (first 1000 chars):");
  console.log(data.text.substring(0, 1000));
}
run().catch(console.error);
