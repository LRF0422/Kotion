
import pako from "pako"
import * as zlib from "zlib"

export { stringify, parse } from "zipson"

function Uint8ArrayToString(fileData: Uint8Array) {
    var dataString = "";
    for (var i = 0; i < fileData.length; i++) {
        dataString += String.fromCharCode(fileData[i]);
    }
    return dataString

}

function stringToUint8Array(str: string) {
    var arr = [];
    for (var i = 0, j = str.length; i < j; ++i) {
        arr.push(str.charCodeAt(i));
    }

    var tmpUint8Array = new Uint8Array(arr);
    return tmpUint8Array
}
export const zip = (str: string) => {
    const compress = zlib.gzipSync(str)
    return Uint8ArrayToString(compress)
}

export const unzip = (str: string) => {
    console.log('str', str);
    if (str) {
        zlib.unzipSync(stringToUint8Array(str))
    }
    return "{}"
}