const core = require('@actions/core');
const github = require('@actions/github');
const matrix = require('matrix-bot-sdk');

function generateNoticeHtml(status) {
    const context = github.context;

    let colour = "#ff0000";
    if (status === "Succeeded") {
        colour = "#00ff00";
    }

    const timestamp = new Date().toUTCString();
    const branch = `${process.env.GITHUB_REF_NAME}`;
    const buildUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;

    return `GitHub Actions build for ${branch} <font color="${colour}">${status}</font> at <a href="${buildUrl}">${timestamp}</a>`;

}

try {
    const status = core.getInput("status");
    const matrixToken = core.getInput("token");
    const roomId = core.getInput("roomid");
    const homeserverUrl = core.getInput("homeserver");

    const client = new matrix.MatrixClient(homeserverUrl, matrixToken);
    client.sendHtmlNotice(roomId, generateNoticeHtml(status)).then(
        (eventId) => core.setOutput(eventId)
    );
} catch (error) {
    core.setFailed(error.message);
}

