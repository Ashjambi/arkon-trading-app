import * as tf from '@tensorflow/tfjs';

// Feature Engineering: OFI, Hurst Exponent, Volatility
export const generateFeatures = (data: number[], ofiValues: number[]) => {
    const features = [];
    const windowSize = 14;

    for (let i = windowSize; i < data.length; i++) {
        const window = data.slice(i - windowSize, i);
        
        // 1. Hurst Exponent (Simplified)
        const diffs = window.slice(1).map((val, idx) => val - window[idx]);
        const hurst = Math.abs(diffs.reduce((a, b) => a + b) / (stdDev(diffs) || 1));

        // 2. OFI (Order Flow Imbalance)
        const ofi = ofiValues[i] || 0;

        // 3. Volatility
        const mean = window.reduce((a, b) => a + b) / windowSize;
        const volatility = Math.sqrt(window.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / windowSize);
        
        features.push([hurst, ofi, volatility]);
    }
    return tf.tensor2d(features);
};

const stdDev = (arr: number[]) => {
    const mean = arr.reduce((a, b) => a + b) / arr.length;
    return Math.sqrt(arr.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / arr.length);
};
