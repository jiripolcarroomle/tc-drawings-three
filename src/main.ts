import * as  flatted from 'flatted'


//import orderJsonRaw from '../assets/simpleorder.flatted.json?raw'
//
import orderJsonRaw from '../assets/biggerorder.flatted.json?raw'
import { appOrderFunction } from './orderfunction'

//import orderJsonRaw from '../assets/10000141.flatted.json?raw'
//import orderJsonRaw from '../assets/10000187.flatted.json?raw'


const orderJson = flatted.parse(orderJsonRaw)

// get the html document
const document = window.document;

const run = async () => {
  const orderCallResults = await appOrderFunction(orderJson.o, orderJson.ol);

  orderCallResults.forEach(result => {
    const img = document.createElement('img');
    img.src = result.renderedResult.image;
    document.body.appendChild(img);
  });
}
run();