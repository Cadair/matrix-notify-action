const core = require('@actions/core');
const github = require('@actions/github');
const matrix = require('matrix-bot-sdk');
const datefns = require('date-fns');
const util = require('node:util');


function generateNoticeHtml(status) {
    const context = github.context;

    let colour = "#ff0000";
    if (status === "Succeeded") {
        colour = "#00ff00";
    }

    const timestamp = datefns.format(new Date(), 'yyyy-MM-dd HH:mm');
    const branch = `${process.env.GITHUB_REF_NAME}`;
    const buildUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;

    return `GitHub Actions build for ${branch} <font color="${colour}">${status}</font> at <a href="${buildUrl}">${timestamp}</a>`;

}

async function getPreviousJobs() {
    const githubToken = core.getInput("github_token");
    const context = github.context;
    const octokit = github.getOctokit(githubToken);

    const workflow = await octokit.rest.actions.listJobsForWorkflowRun({...context.repo,
                                                                        run_id: context.runId,
                                                                        filter:'latest'});

    const completedJobs = workflow.data.jobs.filter(
        job => job.completed_at != null
    );
    return completedJobs;
}

async function gatherPreviousJobStatus(completedJobs) {
    const allConclusions = completedJobs.map(job => job.conclusion);

    let status = "Failed";
    if (allConclusions.every(conclusion => conclusion === "success")) {
        status = "Succeeded";
    }
    return status;
}

async function generateReactions(completedJobs) {
    const unknownReact = "⚪";
    const symbols = {success: "🟢", failure: "🔴"};

    const reactions = [];
    completedJobs.map(
        (job) => {
            const symbol = symbols[job.conclusion] || unknownReact;
            const reaction = `${symbol} ${job.name}`;
            reactions.push(reaction);
        });

    return reactions;
}

async function sendMatrixNotification() {
    const completedJobs = await getPreviousJobs();
    const reactions = await generateReactions(completedJobs);
    const status = await gatherPreviousJobStatus(completedJobs);

    const matrixToken = core.getInput("matrix_token");
    const roomId = core.getInput("roomid");
    const homeserverUrl = core.getInput("homeserver");

    const client = new matrix.MatrixClient(homeserverUrl, matrixToken);
    eventId = await client.sendHtmlNotice(roomId, generateNoticeHtml(status));
    core.setOutput("eventId", eventId);

    for (let reaction of reactions) {
        await client.unstableApis.addReactionToEvent(roomId, eventId, reaction);
    }
}

sendMatrixNotification().catch(err => core.setFailed(err.message));
