import * as  flatted from 'flatted'
import * as TC from "./tc/base";


//
import orderJsonRaw from '../assets/simpleorder.flatted.json?raw'
// import orderJsonRaw from '../assets/biggerorder.flatted.json?raw'
import { appOrderFunction } from './orderfunction'

//import orderJsonRaw from '../assets/10000141.flatted.json?raw'
//import orderJsonRaw from '../assets/10000187.flatted.json?raw'


const orderJson = flatted.parse(orderJsonRaw)

// get the html document
const document = window.document;

const run = async () => {
  const orderCallResults = await appOrderFunction(orderJson.o, orderJson.ol);

  orderCallResults.forEach(result => {
    // Create SVG element
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "auto");
    svg.setAttribute("viewBox", `0 0 ${result.imageWidth} ${result.imageHeight}`); // Default, or you can use actual image size if available

    // Create <image> element and embed PNG
    const image = document.createElementNS(svgNS, "image");
    image.setAttributeNS(null, "href", result.renderedResult.image);
    image.setAttribute("x", "0");
    image.setAttribute("y", "0");
    image.setAttribute("width", result.imageWidth.toString());
    image.setAttribute("height", result.imageHeight.toString());

    svg.appendChild(image);

    const worldToViewMatrix = result.worldToViewMatrix.elements;
    [
      new TC.Vector3(4815, 0, -3690),
      new TC.Vector3(4815 - 561, 820, -3690 + 600),
    ].forEach(vector => {
      const pointToDisplay = vector.applyMatrix4(new TC.Matrix4().fromArray(worldToViewMatrix)) as TC.Vector3;
      console.log('Transformed point:', pointToDisplay);

      // Add annotation (example: a red circle at the transformed point)
      const annotation = document.createElementNS(svgNS, "circle");
      annotation.setAttribute("cx", pointToDisplay._x.toString());
      annotation.setAttribute("cy", pointToDisplay._y.toString());
      annotation.setAttribute("r", "10");
      annotation.setAttribute("fill", "red");
      svg.appendChild(annotation);
    });




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


  });
}
run();