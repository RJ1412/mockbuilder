const fs = require('fs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

async function checkFonts() {
  const filePath = 'C:/Users/rahul/OneDrive/Documents/Question_Report_130.pdf';
  if (!fs.existsSync(filePath)) return;
  const buffer = fs.readFileSync(filePath);
  const data = new Uint8Array(buffer);
  
  const pdfDocument = await pdfjsLib.getDocument({ data, verbosity: 0 }).promise;
  const page = await pdfDocument.getPage(2); // Page 2 has questions
  const textContent = await page.getTextContent();
  
  for (const item of textContent.items.slice(0, 100)) {
    console.log(`Text: '${item.str}' | Font: ${item.fontName} | Size: ${item.transform[0]}`);
  }
}
checkFonts();
