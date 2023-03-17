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
    const refName = process.env.GITHUB_REF_NAME;
    const buildUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;

    return `GitHub Actions build for ${refName} <font color="${colour}">${status}</font> at <a href="${buildUrl}">${timestamp}</a>`;

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
    // We calculate the job status like this and not by asking GH for the
    // workflow status as the workflow hasn't finished yet.
    const allConclusions = completedJobs.map(job => job.conclusion);

    // We want to Succeed if there are skipped jobs and only fail if there are
    // failed ones.
    let status = "Failed";
    if (allConclusions.every(conclusion => conclusion != "failure")) {
        status = "Succeeded";
    }
    return status;
}

async function generateReactions(completedJobs) {
    const unknownReact = "⚪";
    const symbols = {success: "🟢", failure: "🔴"};

    // Extract some config
    const ignorePattern = core.getInput("ignore_pattern");
    const ignoreSuccess = JSON.parse(core.getInput("ignore_success"));
    core.debug(`Got ignorePattern=${ignorePattern} and ignoreSuccess=${ignoreSuccess} ${typeof(ignoreSuccess)}`);

    const reactions = [];
    let nSuccess = 0;
    completedJobs.map(
        (job) => {
            core.debug(`Processing job: ${JSON.stringify(job)}`)
            // If the job name matches the ignore pattern, then don't push it
            let skip = false;
            if (ignorePattern) {
                const re = new RegExp(ignorePattern);
                skip = re.exec(job.name);
            }

            const symbol = symbols[job.conclusion] || unknownReact;
            let name = job.name.split(" / ");
            name = name[name.length - 1];
            let reaction = `${symbol} ${name}`;
            if (reactions.includes(reaction)) {
                const count = reactions.filter(r => r.startsWith(reaction)).length;
                reaction = `${reaction} ${count}`;
            }

            if (job.conclusion == "success") {
                core.debug("Incrementing success");
                nSuccess = nSuccess + 1;
                if (ignoreSuccess) {
                    skip = true;
                }
            }

            if (!skip) {
                reactions.push(reaction);
            }
        });

    core.debug(`${nSuccess} jobs succeeded`);
    if (ignoreSuccess) {
        reactions.push(`${symbols.success} ${nSuccess} succeeded`);
    }

    core.debug(`Generated these reactions: ${reactions}`);
    return reactions;
}

async function callMatrixWithRetry(otherFunc) {
    attempt = 1;
    while (true) {
        try {
            resp = await otherFunc();
            return resp;
        } catch (err) {
            if (attempt < 11 & err?.body?.errcode === 'M_LIMIT_EXCEEDED') {
                core.debug(`$Retry attempt = ${attempt}`);
                let retryAfterMs = attempt * attempt * 100;
                if ("retry_after_ms" in err.body) {
                    try {
                        retryAfterMs = Number.parseInt(err.body.retry_after_ms, 10) * attempt;
                    } catch (ex) {
                        // Use default value.
                    }
                }
                core.info(`Waiting ${retryAfterMs} ms before retrying`);
                await new Promise(resolve => setTimeout(resolve, retryAfterMs));
                attempt += 1;
            } else {
                throw(err);
            }
        }
    }
}

async function sendMatrixNotification() {
    const completedJobs = await getPreviousJobs();
    const reactions = await generateReactions(completedJobs);
    const status = await gatherPreviousJobStatus(completedJobs);

    const matrixToken = core.getInput("matrix_token");
    const roomId = core.getInput("roomid");
    const homeserverUrl = core.getInput("homeserver");

    const client = new matrix.MatrixClient(homeserverUrl, matrixToken);
    core.debug(`Sending message to room: ${roomId}`);
    eventId = await callMatrixWithRetry(() => (client.sendHtmlNotice(roomId, generateNoticeHtml(status))));
    core.setOutput("eventId", eventId);
    core.debug(`Sent messge, eventId=${eventId}`);

    for (let reaction of reactions) {
        core.debug(`Sending reaction: ${reaction}`);
        reactEventId = await callMatrixWithRetry(() => client.unstableApis.addReactionToEvent(roomId, eventId, reaction));
        core.debug(`Sent reaction, eventId=${reactEventId}`);
    }
}

sendMatrixNotification().catch(err => core.setFailed(err.message));
