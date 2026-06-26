const fs = require('fs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

async function dumpText() {
  const filePath = 'C:/Users/rahul/OneDrive/Documents/Question_Report_130.pdf';
  if (!fs.existsSync(filePath)) {
    console.log("PDF not found.");
    return;
  }
  const buffer = fs.readFileSync(filePath);
  const data = new Uint8Array(buffer);
  
  const loadingTask = pdfjsLib.getDocument({ data, verbosity: 0 });
  const pdfDocument = await loadingTask.promise;
  
  let fullText = "";
  for (let i = 1; i <= pdfDocument.numPages; i++) {
    const page = await pdfDocument.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items;
    
    // Simple sort by y then x
    items.sort((a, b) => {
        const yA = a.transform[5];
        const yB = b.transform[5];
        if (Math.abs(yA - yB) < 4) return a.transform[4] - b.transform[4];
        return yB - yA; // Flipped Y
    });
    
    let pageText = "";
    let lastY = -1;
    for (const item of items) {
        if (lastY !== -1 && Math.abs(item.transform[5] - lastY) > 8) {
            pageText += "\n";
        }
        pageText += item.str;
        lastY = item.transform[5];
    }
    fullText += `\n--- PAGE ${i} ---\n` + pageText;
  }
  
  fs.writeFileSync('D:/mockbuilder/pdf_dump.txt', fullText);
  console.log("Dumped to pdf_dump.txt");
}

dumpText();
