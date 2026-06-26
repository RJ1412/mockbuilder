const fs = require('fs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

async function debugQ() {
  const filePath = 'C:/Users/rahul/OneDrive/Documents/Question_Report_130.pdf';
  const buffer = fs.readFileSync(filePath);
  const data = new Uint8Array(buffer);
  
  const loadingTask = pdfjsLib.getDocument({ data, verbosity: 0 });
  const pdfDocument = await loadingTask.promise;
  // It's question 10, likely on page 3 or 4 or 5
  for (let p = 3; p <= 6; p++) {
    const page = await pdfDocument.getPage(p);
    const textContent = await page.getTextContent();
    let text = textContent.items.map(i => i.str).join('');
    if (text.includes('critical angle')) {
       console.log(`Found on page ${p}`);
       for (const item of textContent.items) {
           if (item.transform[5] > 0) { // Just a dummy filter to print all
               console.log(`[x:${Math.round(item.transform[4])}, y:${Math.round(page.getViewport({scale:1}).height - item.transform[5])}] ${item.str}`);
           }
       }
       break;
    }
  }
}
debugQ();
