import * as pdfjsLib from './pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs';

window.extractPdfPages = async file => {
  const data = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    pages.push({
      pageNumber,
      width: viewport.width,
      height: viewport.height,
      items: content.items
        .filter(item => item.str?.trim())
        .map(item => ({ text: item.str.trim(), x: item.transform[4], y: item.transform[5] }))
    });
  }
  return pages;
};

window.dispatchEvent(new Event('pdf-reader-ready'));
