const fs = require('fs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

async function debug() {
  const data = new Uint8Array(fs.readFileSync('C:/Users/rahul/OneDrive/Documents/Question_Report_130.pdf'));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const page = await doc.getPage(1);
  const textContent = await page.getTextContent();
  
  const viewport = page.getViewport({ scale: 1 });
  console.log("Page width:", viewport.width);
  
  for (let i = 0; i < 30; i++) {
    const item = textContent.items[i];
    console.log(`X: ${item.transform[4].toFixed(2)}, text: ${item.str}`);
  }
}
debug().catch(console.error);
