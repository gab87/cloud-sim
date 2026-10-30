import { generateCloudNoiseData } from './noise';

self.onmessage = (e: MessageEvent<{ size: number; seed: number }>) => {
  const data = generateCloudNoiseData(e.data.size, e.data.seed);
  (self as unknown as Worker).postMessage(data, [data.buffer]);
};
