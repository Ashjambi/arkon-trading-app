import * as tf from '@tensorflow/tfjs';

export const evaluateModel = (model: tf.LayersModel, xTest: tf.Tensor, yTest: tf.Tensor) => {
    const results = model.evaluate(xTest, yTest);
    return {
        loss: results[0].dataSync()[0],
        accuracy: results[1].dataSync()[0]
    };
};
