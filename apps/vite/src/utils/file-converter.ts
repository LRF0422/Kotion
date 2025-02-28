export function dataURLToBlob(dataurl: string) {
  // @ts-ignore
  let arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
    bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

const validateSVG = (SVG: string) => {

  // VERIFY SVG NAMESPACE MATCHES
  const SVGNamespace = SVG.trim().replace(/\s+/g, ' ').substr(0, 39);
  const SVGNamespaceMatch = '<svg xmlns="http://www.w3.org/2000/svg"';
  const SVGNamespaceMatches = (SVGNamespace === SVGNamespaceMatch) ? true : false;

  // VERIFY SVG REPRESENTS WELL-FORMED XML
  const XMLParser = new DOMParser();
  const parsedDocument = XMLParser.parseFromString(SVG, 'image/svg+xml');
  const wellFormedXML = (parsedDocument.documentElement.nodeName.indexOf('parsererror') < 0) ? true : false;

  return { SVGNamespaceMatches, wellFormedXML, parsedDocument };
}

const SVGToDataURL = (SVG: string) => {

  let output;
  const { SVGNamespaceMatches, wellFormedXML, parsedDocument } = validateSVG(SVG);

  // ASSIGN TO OUTPUT: SVG CONVERTED INTO DATA URL
  if ((SVGNamespaceMatches === true) && (wellFormedXML === true)) {

    let dataURL = SVG;
    dataURL = dataURL.replace(/(\s*\n)*\s+/g, ' ');
    dataURL = dataURL.replace(/[\"|\']/g, '%22');
    dataURL = dataURL.replace(/\>\s+\</g, '><');
    dataURL = dataURL.replace(/\s\/\>/g, '/>');
    dataURL = dataURL.replace(/\s*\:\s*/g, ':');
    dataURL = dataURL.replace(/\s*\;\s*/g, ';');
    dataURL = dataURL.replace(/\s*\{\s*/g, '{');
    dataURL = dataURL.replace(/\s*\}\s*/g, '}');
    dataURL = dataURL.replace(/\s*\,\s*/g, ',');

    dataURL = dataURL.trim();

    const characterArray = dataURL.split('');

    for (let i = 0; i < characterArray.length; i++) {

      if (characterArray[i].match(/[A-Za-z0-9\.\,\;\:\/\*\-\=\_\~\'\!\$\@]/) === null) {

        characterArray[i] = encodeURIComponent(characterArray[i]);
      }
    }

    dataURL = 'data:image/svg+xml,' + characterArray.join('');

    output = dataURL;
  }


  return output;
}