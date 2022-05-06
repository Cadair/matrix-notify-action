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

async function gatherPreviousJobStatus() {
    const githubToken = core.getInput("github_token");
    const context = github.context;
    const octokit = github.getOctokit(githubToken);

    const workflow = await octokit.rest.actions.listJobsForWorkflowRun({...context.repo,
                                                                        run_id: context.runId,
                                                                        filter:'latest'});

    core.info(util.inspect(workflow, colors=true, depth=null));
    core.info("\n\n\n");

    const completedJobs = workflow.data.jobs.filter(
        job => job.completed_at != null
    );

    core.info(util.inspect(completedJobs, colors=true, depth=null));

    const allConclusions = completedJobs.map(job => job.conclusion);
    core.info(allConclusions);

    let status = "Failed";
    if (allConclusions.every(conclusion => conclusion === "success")) {
        status = "Succeeded";
    }
    return status;

}

async function sendMatrixNotification() {
    const status = await gatherPreviousJobStatus();
    const matrixToken = core.getInput("matrix_token");
    const roomId = core.getInput("roomid");
    const homeserverUrl = core.getInput("homeserver");

    const client = new matrix.MatrixClient(homeserverUrl, matrixToken);
    eventId = await client.sendHtmlNotice(roomId, generateNoticeHtml(status));
    core.setOutput("eventId", eventId);
}

sendMatrixNotification().catch(err => core.setFailed(err.message));
