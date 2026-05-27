import { parseFlattedWithNestedPropertyValues } from './dev-helpers';
import './style.css';


// 
//import orderJsonRaw from '../assets/simpleorder.flatted.json?raw'
// 
//import orderJsonRaw from '../assets/cornersorder.flatted.json?raw'
// 
//
import orderJsonRaw from '../assets/biggerorder.flatted.json?raw'
//import orderJsonRaw from '../assets/10000141.flatted.json?raw'
//import orderJsonRaw from '../assets/10000187.flatted.json?raw'

import { appOrderFunction } from './orderfunction'



const orderJson = parseFlattedWithNestedPropertyValues<{ o: unknown; ol: unknown }>(orderJsonRaw)

// get the html document
const document = window.document;
const result: Map<string, any> = new Map();

run();











async function run() {
  await appOrderFunction(orderJson.o, orderJson.ol, result);
  const appRoot = document.querySelector<HTMLElement>('#app') ?? document.body;


  Array.from(result.keys()).forEach((key) => {
    const { content, mimeType } = result.get(key)!;
    if (mimeType === 'image/svg+xml') {
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(content, 'image/svg+xml');
      const svgElement = svgDoc.documentElement;
      addSvgToDocument(appRoot, svgElement);
    }

  });
}


function addSvgToDocument(target: HTMLElement, svg: any) {

  target.appendChild(svg);

  // Add download button for SVG
  const downloadBtn = document.createElement('button');
  downloadBtn.textContent = 'Download SVG';
  downloadBtn.style.display = 'block';
  downloadBtn.style.margin = '8px 0 24px 0';
  downloadBtn.onclick = () => {
    // Serialize SVG
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rendered-image.svg';
    target.appendChild(a);
    a.click();
    setTimeout(() => {
      target.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };
  target.appendChild(downloadBtn);

}