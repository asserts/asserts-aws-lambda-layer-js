import * as AssertsSDK from './index';

const lambdaTaskRoot = process.env.LAMBDA_TASK_ROOT;
if (lambdaTaskRoot) {
    const handlerString = process.env._HANDLER;
    if (!handlerString) {
        throw Error(`LAMBDA_TASK_ROOT is non-empty(${lambdaTaskRoot}) but _HANDLER is not set`);
    }
    AssertsSDK.tryPatchHandler(lambdaTaskRoot, handlerString);
} else {
    throw Error('LAMBDA_TASK_ROOT environment variable is not set');
}