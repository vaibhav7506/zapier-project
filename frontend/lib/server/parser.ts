export function parse(text: string, values: unknown, startDelimiter = "{", endDelimiter = "}") {
  let startIndex = 0;
  let endIndex = 1;
  let finalString = "";

  while (endIndex < text.length) {
    if (text[startIndex] === startDelimiter) {
      let endPoint = startIndex + 2;
      while (text[endPoint] !== endDelimiter) {
        endPoint++;
      }

      const keys = text.slice(startIndex + 1, endPoint).split(".");
      let localValues: any = values;
      for (const key of keys) {
        if (typeof localValues === "string") {
          localValues = JSON.parse(localValues);
        }
        localValues = localValues[key];
      }
      finalString += localValues;
      startIndex = endPoint + 1;
      endIndex = endPoint + 2;
    } else {
      finalString += text[startIndex];
      startIndex++;
      endIndex++;
    }
  }

  if (text[startIndex]) {
    finalString += text[startIndex];
  }

  return finalString;
}
