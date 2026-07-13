const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const { Jimp, rgbaToInt, JimpMime } = require('jimp');

const isHindi = (text) => /[\u0900-\u097F]/.test(text);

async function parsePdf() {
  const filePath = 'C:/Users/rahul/OneDrive/Documents/Question_Report_130.pdf';
  if (!fs.existsSync(filePath)) {
    console.error(`Error: ${filePath} not found.`);
    process.exit(1);
  }
  
  const buffer = fs.readFileSync(filePath);
  const data = new Uint8Array(buffer);
  
  const standardFontDataUrl = path.join(__dirname, 'node_modules/pdfjs-dist/standard_fonts/');
  const loadingTask = pdfjsLib.getDocument({ 
    data, 
    verbosity: 0,
    standardFontDataUrl,
  });
  
  const pdfDocument = await loadingTask.promise;
  
  let fullText = "";
  const allImages = []; 
  
  for (let i = 1; i <= pdfDocument.numPages; i++) {
    const page = await pdfDocument.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    
    const ops = await page.getOperatorList();
    for (let j = 0; j < ops.fnArray.length; j++) {
      if (ops.fnArray[j] === pdfjsLib.OPS.paintImageXObject || ops.fnArray[j] === pdfjsLib.OPS.paintJpegXObject) {
        try {
          const objId = ops.argsArray[j][0];
          const imgData = await page.objs.get(objId);
          if (imgData && imgData.data && imgData.width > 10 && imgData.height > 10) {
            const isRGBA = imgData.data.length === imgData.width * imgData.height * 4;
            const isRGB = imgData.data.length === imgData.width * imgData.height * 3;
            const isGray = imgData.data.length === imgData.width * imgData.height;
            if (isRGBA || isRGB || isGray) {
               let img;
               try {
                  img = new Jimp({ width: imgData.width, height: imgData.height });
               } catch(e) {
                  console.error(e);
                  continue;
               }
               let dataIdx = 0;
               for (let y = 0; y < imgData.height; y++) {
                  for (let x = 0; x < imgData.width; x++) {
                     let r, g, b, a = 255;
                     if (isRGBA) {
                        r = imgData.data[dataIdx++];
                        g = imgData.data[dataIdx++];
                        b = imgData.data[dataIdx++];
                        a = imgData.data[dataIdx++];
                     } else if (isRGB) {
                        r = imgData.data[dataIdx++];
                        g = imgData.data[dataIdx++];
                        b = imgData.data[dataIdx++];
                     } else {
                        r = g = b = imgData.data[dataIdx++];
                     }
                     img.setPixelColor(rgbaToInt(r, g, b, a), x, y);
                  }
               }
               const b64 = await img.getBase64('image/png');
               allImages.push({ page: i, b64 });
            }
          }
        } catch(e) { }
      }
    }

    const textContent = await page.getTextContent();
    const items = textContent.items;
    
    items.sort((a, b) => {
        const yA = a.transform[5];
        const yB = b.transform[5];
        if (Math.abs(yA - yB) < 4) return a.transform[4] - b.transform[4];
        return yB - yA;
    });
    
    let lastY = -1;
    for (const item of items) {
        if (isHindi(item.str)) continue;
        
        const x = item.transform[4];
        if (x > viewport.width * 0.52) continue; 

        if (lastY !== -1 && Math.abs(item.transform[5] - lastY) > 8) {
            fullText += "\n";
        } else if (lastY !== -1) {
            fullText += " ";
        }
        fullText += item.str.trim();
        lastY = item.transform[5];
    }
    fullText += `\n---PAGE_${i}---\n`;
  }

  fullText = fullText.replace(/ {2,}/g, ' ');
  fullText = fullText.replace(/LEADER TEST SERIES[\s\S]*?@JEEAdvanced_2025/gi, '');
  fullText = fullText.replace(/Space for Rough Work/gi, '');

  const questions = [];
  let currentSubject = "Physics";
  
  const regex = /(?:\n|^|\s)(?:Q\.|)([1-9]|[1-7][0-9])\.\s/g;
  
  let match;
  const matches = [];
  let lastNum = -1;
  while ((match = regex.exec(fullText)) !== null) {
      const n = parseInt(match[1], 10);
      if (n !== lastNum) {
          matches.push({ index: match.index, text: match[0] });
          lastNum = n;
      }
  }

  let imgCursor = 0; 
  
  for (let idx = 0; idx < matches.length; idx++) {
      const start = matches[idx].index;
      const end = (idx + 1 < matches.length) ? matches[idx + 1].index : fullText.length;
      let qChunk = fullText.substring(start, end).trim();
      
      if (qChunk.toUpperCase().includes("CHEMISTRY")) currentSubject = "Chemistry";
      if (qChunk.toUpperCase().includes("MATHEMATICS")) currentSubject = "Mathematics";
      
      const optA = qChunk.match(/\(A\)\s*(.*?)(?=\(B\)|\(C\)|\(D\)|---PAGE_|$)/s);
      const optB = qChunk.match(/\(B\)\s*(.*?)(?=\(C\)|\(D\)|---PAGE_|$)/s);
      const optC = qChunk.match(/\(C\)\s*(.*?)(?=\(D\)|---PAGE_|$)/s);
      const optD = qChunk.match(/\(D\)\s*(.*?)(?=---PAGE_|$)/s);

      let qType = "numerical";
      let options = [];
      let qTextOnly = qChunk;

      if (optA && optB && optC && optD) {
          qType = "single_correct";
          options = [
              { label: "A", text: optA[1].trim(), image: null },
              { label: "B", text: optB[1].trim(), image: null },
              { label: "C", text: optC[1].trim(), image: null },
              { label: "D", text: optD[1].trim(), image: null }
          ];
          qTextOnly = qChunk.substring(0, optA.index).trim();
      } else {
          qTextOnly = qTextOnly.replace(/---PAGE_\d+---/g, '').trim();
      }

      qTextOnly = qTextOnly.replace(/^(?:(?:Q\.)|)(?:(?:0?[1-9])|[1-7][0-9])\.\s*/, '').trim();

      let pageMatch = qChunk.match(/---PAGE_(\d+)---/);
      let qPage = pageMatch ? parseInt(pageMatch[1]) : 1;

      let qImages = [];
      if (imgCursor < allImages.length) {
         if (Math.abs(allImages[imgCursor].page - qPage) <= 2) {
            qImages.push(allImages[imgCursor].b64);
            imgCursor++;
         }
      }
      
      questions.push({
          question_id: `q-${idx+1}`,
          subject: currentSubject,
          section: qType === 'numerical' ? "Section-II" : "Section-I",
          question_number: idx + 1,
          question_text: qTextOnly,
          question_images: qImages,
          options,
          question_type: qType,
          marks_correct: 4,
          marks_incorrect: qType === 'numerical' ? 0 : -1,
          correct_answer: qType === 'numerical' ? "" : "A",
          solution: null
      });
  }

  const output = { 
      metadata: {
          exam_name: "Mock CBT Exam",
          total_questions: questions.length,
          total_marks: questions.reduce((acc, q) => acc + q.marks_correct, 0),
          duration_minutes: 180,
          subjects: ["Physics", "Chemistry", "Mathematics"]
      }, 
      questions 
  };
  
  fs.writeFileSync('app/(cbt)/tests/cbt-demo/test_data.json', JSON.stringify(output, null, 2), 'utf-8');
  console.log(`Extraction complete! Found ${questions.length} questions. Images extracted: ${allImages.length}`);
}

parsePdf().catch(console.error);
