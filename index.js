const core = require('@actions/core');
// const github = require('@actions/github');
const matrix = require('matrix-bot-sdk');

function generateNoticeHtml(status) {
    if (status == "Succeeded") {
        const colour = "#00ff00";
    } else {
        const colour = "#ff0000";
    }

    const timestamp = new Date().toUTCString();
    const branch = "branch";
    const buildUrl = "https://bbc.co.uk";

    return `GitHub Actions build for ${branch} <font color="${colour}">${status}</font> at <a href='${buildUrl}>${timestamp}</a>`;

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

