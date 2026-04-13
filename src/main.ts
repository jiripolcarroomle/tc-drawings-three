import * as TC from "./tc/base";
import { parseFlattedWithNestedPropertyValues } from './dev-helpers';


// 
// import orderJsonRaw from '../assets/simpleorder.flatted.json?raw'
// 
import orderJsonRaw from '../assets/cornersorder.flatted.json?raw'
// import orderJsonRaw from '../assets/biggerorder.flatted.json?raw'
//import orderJsonRaw from '../assets/10000141.flatted.json?raw'
//import orderJsonRaw from '../assets/10000187.flatted.json?raw'

import { appOrderFunction } from './orderfunction'



const orderJson = parseFlattedWithNestedPropertyValues<{ o: unknown; ol: unknown }>(orderJsonRaw)

// get the html document
const document = window.document;

run();











 async function run() {
  const orderCallResults = await appOrderFunction(orderJson.o, orderJson.ol);

  orderCallResults.forEach(svg => {
  
    addSvgToDocument(document.body, svg);

  });
}

function addSvgToDocument(target: HTMLElement, svg: any) {

  document.body.appendChild(svg);

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
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };
  document.body.appendChild(downloadBtn);

}