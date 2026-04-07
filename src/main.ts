import * as TC from "./tc/base";
import { parseFlattedWithNestedPropertyValues } from './dev-helpers';


// import orderJsonRaw from '../assets/simpleorder.flatted.json?raw'
import orderJsonRaw from '../assets/cornersorder.flatted.json?raw'
//import orderJsonRaw from '../assets/biggerorder.flatted.json?raw'
//import orderJsonRaw from '../assets/10000141.flatted.json?raw'
//import orderJsonRaw from '../assets/10000187.flatted.json?raw'

import { appOrderFunction } from './orderfunction'
import type { IOrderSceneNode } from './scene.interfaces';
import { filterAnnotationForModule, type IAnnotation } from './annotationstable';



const orderJson = parseFlattedWithNestedPropertyValues<{ o: unknown; ol: unknown }>(orderJsonRaw)

// get the html document
const document = window.document;

const run = async () => {
  const orderCallResults = await appOrderFunction(orderJson.o, orderJson.ol);

  orderCallResults.forEach(result => {
    // Create SVG element
    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("width", (result.imageWidth / 2).toString());
    svg.setAttribute("height", (result.imageHeight / 2).toString());
    svg.setAttribute("viewBox", `0 0 ${result.imageWidth} ${result.imageHeight}`); // Default, or you can use actual image size if available

    // Create <image> element and embed PNG
    const image = document.createElementNS(svgNS, "image");
    image.setAttributeNS(null, "href", result.image.image);
    image.setAttribute("x", "0");
    image.setAttribute("y", "0");
    image.setAttribute("width", result.imageWidth.toString());
    image.setAttribute("height", result.imageHeight.toString());

    svg.appendChild(image);

    const worldToViewMatrix = new TC.Matrix4().fromArray(result.worldToViewMatrix.elements);

    const points: { points: TC.Vector3[]; moduleId: string }[] = result.data?.modulesInDrawing?.flatMap((moduleNode: IOrderSceneNode) => {
      const moduleData = moduleNode.orderLineEntry;
      const id = moduleData!.modId;
      const annotations = filterAnnotationForModule(id, moduleData, result.data);
      if (annotations.length > 0) {
        const result = { points: [], moduleId: id };
        annotations.forEach((annotation: IAnnotation) => {
          const annotablePoints = annotation.out_AnnotablePoints(moduleData);
          const drawingAnnotablePoints = annotablePoints.map(ap => ap.coordinate.copy().applyMatrix4(moduleNode.worldTransform) as TC.Vector3);
          result.points.push(...drawingAnnotablePoints);
        });
        // If there are annotations, get the points from the annotations
        return result;
      }
      else {
        return null;;
        //return { points: moduleNode.getAllBBoxCornersInWorld(), moduleId: id };
      }

    });

    points?.forEach((pointData: { points: TC.Vector3[]; moduleId: string }) => {
      if (!pointData) { return; }
      const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16); // Generate random color for each point
      const displayPoints = pointData.points.map((point) => point.copy().applyMatrix4(worldToViewMatrix) as TC.Vector3);
      const vector = displayPoints[0]; // Example: take the first corner of the bounding box
      const label = pointData.moduleId; // Example: use module ID as label
      const pointToDisplay = vector;
      //console.log('Transformed point:', pointToDisplay);

      const text = document.createElementNS(svgNS, "text");
      text.setAttribute("x", (pointToDisplay._x + 5).toString()); // Position label slightly to the right of the point
      text.setAttribute("y", (pointToDisplay._y - 5).toString()); // Position label slightly above the point
      text.setAttribute("font-size", "30");
      text.setAttribute("fill", randomColor);
      text.textContent = label;
      svg.appendChild(text);

      displayPoints.forEach((displayPoint) => {
        // Add a dot and a label
        const annotation = document.createElementNS(svgNS, "circle");
        annotation.setAttribute("cx", displayPoint._x.toString());
        annotation.setAttribute("cy", displayPoint._y.toString());
        annotation.setAttribute("r", "5");
        annotation.setAttribute("fill", randomColor);
        svg.appendChild(annotation);
      });

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