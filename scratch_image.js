const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const fs = require('fs');

async function run() {
  const data = new Uint8Array(fs.readFileSync('scratch.pdf'));
  const loadingTask = pdfjsLib.getDocument({data});
  const pdfDocument = await loadingTask.promise;
  console.log("Pages:", pdfDocument.numPages);
  
  let imageCount = 0;
  for (let i = 1; i <= Math.min(3, pdfDocument.numPages); i++) {
    const page = await pdfDocument.getPage(i);
    const ops = await page.getOperatorList();
    for (let j = 0; j < ops.fnArray.length; j++) {
      if (ops.fnArray[j] === pdfjsLib.OPS.paintImageXObject) {
        imageCount++;
      }
    }
  }
  console.log("Images found in first 3 pages:", imageCount);
}
run().catch(console.error);
