import * as tf from '@tensorflow/tfjs';

export const trainModel = async (model: tf.LayersModel, xTrain: tf.Tensor, yTrain: tf.Tensor) => {
    return await model.fit(xTrain, yTrain, {
        epochs: 50,
        batchSize: 32,
        shuffle: true,
    });
};
