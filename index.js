const core = require('@actions/core');
const github = require('@actions/github');
const matrix = require('matrix-bot-sdk');

try {
    const status = core.getInput("status");
    const matrixToken = core.getInput("token");
    const roomId = core.getInput("roomid");
    const homeserverUrl = core.getInput("homeserver");

    const client = matrix.MatrixClient(homeserverUrl, matrixToken);
    const eventId = await client.sendNotice(roomId, "Hello world");

    core.setOutput(eventId);

} catch (error) {
    core.setFailed(error.message);
}

