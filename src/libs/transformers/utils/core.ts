interface InitiateProgressInfo {
  status: 'initiate';
  name: string;
  file: string;
}

interface DownloadProgressInfo {
  status: 'download';
  name: string;
  file: string;
}

interface ProgressStatusInfo {
  status: 'progress';
  name: string;
  file: string;
  progress: number;
  loaded: number;
  total: number;
}

interface DoneProgressInfo {
  status: 'done';
  name: string;
  file: string;
}

interface ReadyProgressInfo {
  status: 'ready';
  task: string;
  model: string;
}

export type ProgressInfo =
  | InitiateProgressInfo
  | DownloadProgressInfo
  | ProgressStatusInfo
  | DoneProgressInfo
  | ReadyProgressInfo;
export type ProgressCallback = (progressInfo: ProgressInfo) => void;

export function dispatchCallback(progress_callback: ProgressCallback | null | undefined, data: ProgressInfo): void {
  if (progress_callback) progress_callback(data);
}

export function reverseDictionary(data: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [value, key]));
}

export function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isTypedArray(val: any): boolean {
  return val?.prototype?.__proto__?.constructor?.name === 'TypedArray';
}

export function isIntegralNumber(x: any): boolean {
  return Number.isInteger(x) || typeof x === 'bigint';
}

export function isNullishDimension(x: any): boolean {
  return x === null || x === undefined || x === -1;
}

export function calculateDimensions(arr: any[]): number[] {
  const dimensions: number[] = [];
  let current: any = arr;
  while (Array.isArray(current)) {
    dimensions.push(current.length);
    current = current[0];
  }
  return dimensions;
}

export function pop<T>(obj: Record<string, T>, key: string, defaultValue?: T): T {
  const value = obj[key];
  if (value !== undefined) {
    delete obj[key];
    return value;
  }
  if (defaultValue === undefined) {
    throw Error(`Key ${key} does not exist in object.`);
  }
  return defaultValue;
}

export function mergeArrays<T>(...arrs: T[][]): T[] {
  return Array.prototype.concat.apply([], arrs);
}

export function product<T>(...a: T[][]): T[][] {
  return a.reduce<T[][]>(
    (acc, curr) => acc.flatMap((d) => curr.map((e) => [...(Array.isArray(d) ? (d as T[]) : [d]), e])),
    [[]],
  );
}

export function calculateReflectOffset(i: number, w: number): number {
  return Math.abs(((i + w) % (2 * w)) - w);
}

// export function pick<T>(obj: T, keys: Array<keyof T>) {
//   return Object.fromEntries(keys.map((k) => [k, obj[k as keyof T]]));
// }
export function pick(o: any, props: string[]) {
    return Object.assign(
        {},
        ...props.map((prop: string) => {
            if (o[prop] !== undefined) {
        return { [prop]: o[prop] };
      }
    }),
  );
}

export function len(s: string): number {
  let length = 0;
  for (const c of s) ++length;
  return length;
}

export function count<T>(arr: T[] | string, value: T): number {
  let count = 0;
  for (const v of arr) {
    if (v === value) ++count;
  }
  return count;
}

/**
 * Save blob file on the web.
 * @param {string} path The path to save the blob to
 * @param {Blob} blob The blob to save
 */
export function saveBlob(path: string, blob: Blob){
  // Convert the canvas content to a data URL
  const dataURL = URL.createObjectURL(blob);

  // Create an anchor element with the data URL as the href attribute
  const downloadLink = document.createElement('a');
  downloadLink.href = dataURL;

  // Set the download attribute to specify the desired filename for the downloaded image
  downloadLink.download = path;

  // Trigger the download
  downloadLink.click();

  // Clean up: remove the anchor element from the DOM
  downloadLink.remove();

  // Revoke the Object URL to free up memory
  URL.revokeObjectURL(dataURL);
}

