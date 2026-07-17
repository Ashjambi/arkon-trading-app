import * as tf from '@tensorflow/tfjs';

export const generateSignal = (model: tf.LayersModel, features: tf.Tensor) => {
    const prediction = model.predict(features) as tf.Tensor;
    return prediction.dataSync()[0] > 0.5 ? 'BUY' : 'SELL';
};
