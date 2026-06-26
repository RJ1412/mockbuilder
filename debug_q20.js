const fs = require('fs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

async function debug() {
  const filePath = 'C:/Users/rahul/OneDrive/Documents/Question_Report_130.pdf';
  const buffer = fs.readFileSync(filePath);
  const data = new Uint8Array(buffer);
  
  const loadingTask = pdfjsLib.getDocument({ data, verbosity: 0 });
  const pdfDocument = await loadingTask.promise;
  const page = await pdfDocument.getPage(8);
  const textContent = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1.0 });

  for (const item of textContent.items) {
      const y = viewport.height - item.transform[5];
      console.log(`[x:${Math.round(item.transform[4])}, y:${Math.round(y)}] ${item.str}`);
  }
}
debug();
