const fs = require('fs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const path = require('path');

async function extractImages() {
  const data = new Uint8Array(fs.readFileSync('C:/Users/rahul/OneDrive/Documents/Question_Report_130.pdf'));
  const loadingTask = pdfjsLib.getDocument({ 
      data, 
      verbosity: 0,
      standardFontDataUrl: path.join(__dirname, 'node_modules/pdfjs-dist/standard_fonts/')
  });
  const pdfDocument = await loadingTask.promise;
  
  // Try first page
  const page = await pdfDocument.getPage(9); // user mentioned page 9 has images
  const ops = await page.getOperatorList();
  
  for (let j = 0; j < ops.fnArray.length; j++) {
    if (ops.fnArray[j] === pdfjsLib.OPS.paintImageXObject || ops.fnArray[j] === pdfjsLib.OPS.paintJpegXObject) {
      const objId = ops.argsArray[j][0];
      const imgData = await page.objs.get(objId);
      
      console.log(`Found image: ${objId}, width: ${imgData.width}, height: ${imgData.height}, kind: ${imgData.kind}`);
      
      if (imgData.data) {
        console.log(`Image data length: ${imgData.data.length}`);
      }
      return; // just test the first one
    }
  }
  console.log("No images found on page 9.");
}
extractImages().catch(console.error);
