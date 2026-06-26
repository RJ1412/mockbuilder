const fs = require('fs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

async function debugGaps() {
  const filePath = 'C:/Users/rahul/OneDrive/Documents/Question_Report_130.pdf';
  if (!fs.existsSync(filePath)) {
    console.log("PDF not found.");
    return;
  }
  const buffer = fs.readFileSync(filePath);
  const data = new Uint8Array(buffer);
  
  const loadingTask = pdfjsLib.getDocument({ data, verbosity: 0 });
  const pdfDocument = await loadingTask.promise;
  
  // Page 2 has questions
  const page = await pdfDocument.getPage(2);
  const textContent = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1.0 });

  let validBlocks = [];
  for (const item of textContent.items) {
    if (!item.str.trim()) continue;
    const transform = item.transform;
    const x = transform[4];
    const y = viewport.height - transform[5]; 
    if (x > viewport.width * 0.52) continue;
    validBlocks.push({ x, y, text: item.str });
  }

  validBlocks.sort((a, b) => a.y - b.y);

  let lastLineY = -1;
  for (let i = 0; i < validBlocks.length; i++) {
    const b = validBlocks[i];
    if (lastLineY !== -1) {
       const gap = b.y - lastLineY;
       if (gap > 20) {
          console.log(`Gap of ${Math.round(gap)}px between '${validBlocks[i-1].text}' and '${b.text}'`);
       }
    }
    lastLineY = b.y;
  }
}

debugGaps();
